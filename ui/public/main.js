/*
 * meta2-logger-server
 *
 * Testing server start script
 *
 * @author Jiri Hybek <jiri@hybek.cz> (https://jiri.hybek.cz/)
 * @copyright 2017 - 2018 Jiří Hýbek
 * @license MIT
 */

function httpRequest(method, path, query, body, cb){

	var xhrReq = new XMLHttpRequest();
	var reqUrl = path + ( query ? "?" + query : "" );

	xhrReq.addEventListener("load", function(){

		// Check response status code
		if(xhrReq.status >= 400)
			return cb(new Error(xhrReq.responseText));

		if(xhrReq.status == 204)
			return cb(null, null);

		// Try to parse response
		try{

			var payload = JSON.parse(xhrReq.responseText);

			return cb(null, payload);

		} catch(err){

			return cb(err);

		}

	});

	xhrReq.open(method, reqUrl);

	if(body instanceof FormData){

		xhrReq.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

		var _bodyParts = [];

		for(var [key, value] of body.entries())
			_bodyParts.push(key + "=" + encodeURIComponent(value));

		xhrReq.send(_bodyParts.join("&"));

	} else if(body instanceof Object) {

		xhrReq.setRequestHeader("Content-Type", "application/json");
		xhrReq.send(JSON.stringify(body));

	} else if(body) {

		xhrReq.send(body);

	} else {
		
		xhrReq.send();

	}

}

function showMessage(type, message){

	console.log(type, message);
	//alert(type + ": " + message);

}

function updateConfig(){

	var form = document.getElementById("config");
	var data = new FormData(form);

	httpRequest("post", "./config", null, data, function(err, res){

		if(err)
			showMessage("error", err);
		else
			showMessage("success", "Configuration updated.");

	});

}

function restoreConfig(){

	httpRequest("post", "./restore", null, null, function(err, res){

		if(err)
			showMessage("error", err);
		else {
			showMessage("success", "Configuration restored.");
			location.reload();
		}

	});	

}

function resetFilter(){

	location.href = "?";

}

function clearLog(){

	httpRequest("delete", "./log", null, null, function(err, res){

		if(err)
			showMessage("error", err);
		else {

			showMessage("success", "Log cleared.");

			var logEntries = document.querySelector("#log .entries tbody");
			logEntries.innerHTML = '';

		}

	});	
	
}

function escapeHtml(html){

	return String(html).replace(/</g, "&lt;").replace(/>/g, "&gt;");

}

function addLogEntry(message){

	var logEntries = document.querySelector("#log .entries tbody");

	var row = '';
	row += '<td class="col-timestamp">' + ((new Date(message.timestamp * 1000)).toLocaleString()) + '</td>';
	row += '<td class="col-level level-' + message.level + '">' + message.level + '</td>';
	row += '<td class="col-facility">' + ( message.facility ? '[<strong>' + escapeHtml(message.facility) + '</strong>]' : "&nbsp;" ) + '</td>';
	row += '<td class="col-message"><div class="content-wrap">' + message.message + '</div></td>';
	row += '<td class="col-meta">';

	if(Object.keys(message.meta).length > 0){
		
		row += '<div class="content-wrap"><ul>';
		
		for(var i in message.meta){

			if(i !== "trace")
				row += '<li><span class="key">' + escapeHtml(i) + '</span><span class="value">' + escapeHtml(message.meta[i]) + '</span></li>';

		}
		
		row += '</ul></div>';

	}

	row += '</td>';
	row += '<td class="col-actions">';
	row += '<button class="show-more" title="Show more"><div class="open">+</div><div class="close">-</div></button>';

	if(message.meta["trace"]){
	
		row += '<button class="show-trace" title="Show trace"><svg viewBox="0 0 24 24"><path d="M5,13H19V11H5M3,17H17V15H3M7,7V9H21V7"></path></svg></button>';
		row += '<pre class="trace">' + escapeHtml(message.meta["trace"]) + '</pre>';

	}

	var rowEl = document.createElement("tr");
	rowEl.innerHTML = row;

	if(logEntries.childElementCount > 0)
		logEntries.insertBefore(rowEl, logEntries.children[0]);
	else
		logEntries.appendChild(rowEl);

	// Highlight
	if(hljs){

		var codeTags = rowEl.querySelectorAll("pre code");

		for(var i = 0; i < codeTags.length; i++)
			hljs.highlightBlock(codeTags.item(i));

	}

	// Bind buttons
	bindLogEntry(rowEl);

	// Recalc oddness
	if(logEntries.children.length % 2 == 0){
		document.querySelector("#log .entries").classList.add('even');
		document.querySelector("#log .entries").classList.remove('odd');
	} else {
		document.querySelector("#log .entries").classList.remove('even');
		document.querySelector("#log .entries").classList.add('odd');
	}

}

function bindLogEntry(entryEl){

	if(entryEl.__bound) return;
	entryEl.__bound = true;

	var moreBtn = entryEl.querySelector(".show-more");

	if(moreBtn)
		moreBtn.addEventListener("click", () => {
			entryEl.classList.toggle("more");
		});

}

function bindAllLogEntries(){

	var logEntries = document.querySelectorAll("#log .entries tbody tr");

	for(var i = 0; i < logEntries.length; i++)
		bindLogEntry(logEntries.item(i));

}

function initLogStream(last){

	if(!window.EventSource){
		console.warn("EventSource is not supported by your browser.");
	}

	var _last = last;

	function connect(){

		var stream = new EventSource("./log/stream" + ( location.search !== "" ? location.search + "&" : "?" ) + "format&from=" + _last);

		stream.addEventListener("open", function(){

			console.info("Log stream opened.");

		});

		stream.addEventListener("close", function(){

			console.info("Log stream closed.");

		});

		stream.addEventListener("error", function(ev){

			console.info("Log stream error");

			stream.close();
			stream = null;
			setTimeout(connect, 1000);

		});

		stream.addEventListener("message", function(ev){

			try {

				var msg = JSON.parse(ev.data);

				_last = msg.timestamp;

				addLogEntry(msg);

			} catch(err) {

				console.error("Cannot parse log stream message:", ev.data, err);

			}

		});

	}

	connect();

}

function initTheme(){

	if(window.localStorage && localStorage.getItem("logger-ui-theme") === "dark")
		document.body.classList.add('theme-dark');

}

function toggleDarkTheme(){

	document.body.classList.toggle('theme-dark');

	if(window.localStorage)
		localStorage.setItem("logger-ui-theme", document.body.classList.contains('theme-dark') ? "dark" : "light");

}

window.addEventListener("load", function(){

	// Bind config form
	var configForm = document.getElementById("config");

	configForm.addEventListener("submit", function(ev){

		ev.preventDefault();
		updateConfig();
		return false;

	});

	document.getElementById("settings-reset").addEventListener("click", restoreConfig);
	document.getElementById("reset-filter").addEventListener("click", resetFilter);
	document.getElementById("clear-log").addEventListener("click", clearLog);
	document.getElementById("theme-switch").addEventListener("click", toggleDarkTheme);

	bindAllLogEntries();

});