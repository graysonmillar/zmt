var zmt_token,
	doc_user_email,
	base_url = "https://zmt.abc/api/v2/",
	zmt_settings,
	zoho_patt = new RegExp("^mail\.zoho\.[a-z]+$");

jQuery(document).ready(function($){

	//don't attach any handler if the URL is not like mail.zoho...
	if (!zoho_patt.test(window.location.host)) {
		return;
	}
	console.log("injected");

	refresh_settings(function(){
		// check_doc_email();
	});

	//triggers when any one of the "To","CC","BCC","Subject" fields is changed
	$("body").on("keyup keypress focus blur change", ".zmCTxt .zm_sgst,.zmCTxt.subject-field>input,.ze_area", function (e) {
		check_send_btn($(this));
	});

	// $("body").on("click", ".zm_ry>span", function () {
	// 	//using recurse=true so that the function keeps running until the send button is visible
	// 	check_send_btn($(".ze_area"), true);
	// });


	//event handler for our fake button
	$("body").on("click", "[data-zmt_event='s']", function (e) {
		//even though there should be no event handler for this!
		e.preventDefault();
		e.stopImmediatePropagation();

		//do our insertion if tracking is enabled
		if (zmt_settings.mail_tracking) {
			insert_tracker($(this));
		}
		else {
			send_mail($(this));
		}
	});

});


function refresh_settings(){
	chrome.storage.local.get("zmt_settings", function (result) {
		if (result.zmt_settings !== undefined) {
			console.log(result.zmt_settings);
			window.zmt_settings = JSON.parse(result.zmt_settings);
		}
	});
}

//function that checks that the send button exists in the DOM.
//if recurse is true and there is not send btn(near the el) , it will keep calling itself recursively.
function check_send_btn(el, recurse) {
	//if settings were not found,
	//or if mail tracking is switched off,
	//or if the user is not verified,
	//then don't do anything!
	if (!zmt_settings || !zmt_settings.mail_tracking)
		return;

	if (el.parents(".SC_mclst.zmCnew").find(".SCtxt[data-event='s']").length == 0) {
		//if you want to recurse
		if (recurse)
			setTimeout(function () {
				check_send_btn(el,recurse);
			}, 500);
		else
			return;
	} else {
		replace_send_btn(el);
	}
}

//button used to replce attr of send button so we can capture its click.
//basically our fake button
function replace_send_btn(el) {
	var send_btn = el.parents(".SC_mclst.zmCnew").find(".SCtxt[data-event='s']"),
		tracking_str = (zmt_settings && zmt_settings.mail_tracking) ? "<ul class='zmt_tracking_status'><li>Tracker will be inserted on 'Send'</li></ul>" : "<ul class='zmt_tracking_status'><li>Tracker won't be inserted!</li></ul>";

	//so that I can replace it back!
	send_btn.attr("data-zmt_event", "s").removeAttr("data-event");

	//add an info about tracking status
	var parent = send_btn.parents(".SC_flt");
	console.log(parent.find(".zmt_tracking_status").length);
	if (parent.find(".zmt_tracking_status").length == 0) {
		parent.append(tracking_str);
	}
}

function insert_tracker(send_btn){
	//find the tracking pixel in this mail and the subject of the mail
	var mail_body = send_btn.parents(".SC_mclst.zmCnew").children(".zmCE").find(".ze_area");

	remove_current_pixels_from_mail(mail_body);

	var subject = get_subject_field_val(send_btn),
		to_field = get_to_field_val(send_btn),
		cc_field = get_cc_field_val(send_btn),
		bcc_field = get_bcc_field_val(send_btn);

	console.log(subject,to_field,cc_field,bcc_field);
	return;
	//do some validations here! very important

	fetch_hash(subject, to_field, cc_field, bcc_field, function (hash) {
		var img_str = "<img src='" + base_url + "img/show?hash=" + hash + "' class='zmtr_pixel' />";

		//first make sure that the hash is added to the list of hashes to be blocked, then append the image in the ,mail.
		add_hash_to_local(hash, function () {
			mail_body.contents().find("body").append(img_str);
			send_mail(send_btn);
		});
	});
}

//function that checks if the tracking pixel is present in the mail_body element
//if a pixel is present, it removes it which means that in replies, or nested threads, a user won't get multiple notifications
//mail_body is the jquery element(iframe element)
function remove_current_pixels_from_mail(mail_body) {
	var imgs = mail_body.contents().find('img').filter(function () {
		var src = $(this).attr("src");
		//src was sometimes undefined
		if (typeof src != "undefined" && src.match(/https:\/\/zmt\.abc\/api\/v2\/img\?hash=\w+/)){
			$(this).remove();
		}
	});
}

function get_subject_field_val(send_btn){
	return send_btn.parents(".SC_mclst.zmCnew").find("[id^='zmsub_Cmp']").val();
}

function get_to_field_val(send_btn){
	return send_btn.parents(".SC_mclst.zmCnew").find(".zmCTxt.zmdrop.recipient-field").eq(0).find(".SC_cs").map(function () {
		var tooltip=$(this).attr("data-tooltip"),
			email=extractEmails(tooltip);
		
			if(email.length>0 && is_email_valid(email[0])){
				return email[0];
			}
			else{
				return $(this).find("input").val();
			}
	}).get().join(",");
}

function get_cc_field_val(send_btn) {
	return send_btn.parents(".SC_mclst.zmCnew").find(".zmCTxt.zmdrop.recipient-field").eq(1).find(".SC_cs").map(function () {
		var tooltip = $(this).attr("data-tooltip"),
			email = extractEmails(tooltip);

		if (email.length > 0 && is_email_valid(email[0])) {
			return email[0];
		} else {
			return $(this).find("input").val();
		}
	}).get().join(",");
}

function get_bcc_field_val(send_btn) {
	return send_btn.parents(".SC_mclst.zmCnew").find(".zmCTxt.zmdrop.recipient-field").eq(2).find(".SC_cs").map(function () {
		var tooltip = $(this).attr("data-tooltip"),
			email = extractEmails(tooltip);

		if (email.length > 0 && is_email_valid(email[0])) {
			return email[0];
		} else {
			return $(this).find("input").val();
		}
	}).get().join(",");
}

function extractEmails(text) {
	return text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
}

function is_email_valid(email) {
	var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	return re.test(String(email).toLowerCase());
}

function check_doc_email(){
}