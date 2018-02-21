/*
 * meta2-logger-server
 *
 * @author Jiri Hybek <jiri@hybek.cz> (https://jiri.hybek.cz/)
 * @copyright 2017 - 2018 Jiří Hýbek
 * @license MIT
 */

/**
 * Escape HTML tags to entitites
 *
 * @param content HTML content
 */
export function escapeHtml(content: string) {

	return String(content).replace(/</g, "&lt;").replace(/>/g, "&gt;");

}

/**
 * Parse message content and wrap JSON/JS objects to standalone code tags
 *
 * @param content Message content
 */
export function formatMessage(content: string) {

	let index = 0;
	let opens = 0;
	let inQuote: boolean = false;
	let buffer = "";
	let out = "<pre>";

	const flushBuffer = () => {

		out += escapeHtml(buffer);
		buffer = "";

	};

	while (index < content.length) {

		const char = content.substr(index, 1);

		if (char === "\\") {
			index++;
			buffer += char;
			continue;
		}

		if (char === '"' && !inQuote) {
			inQuote = true;
			buffer += char;
			index++;
			continue;
		}

		if (char === '"' && inQuote) {
			inQuote = false;
			buffer += char;
			index++;
			continue;
		}

		if (char === "{") {

			if (opens === 0) {
				flushBuffer();
				out += "</pre><pre><code class=\"javascript\">{";
			}

			opens++;
			index++;

			continue;

		}

		if (char === "}") {

			opens--;

			if (opens === 0) {

				try {
					// buffer = JSON.stringify(JSON.parse("{" + buffer + "}"), null, 2);
					// buffer = buffer.substr(1, buffer.length - 2);
				} catch (err) {
					// Silent
				}

				flushBuffer();
				out += "}</code></pre><pre>";
				index++;
				continue;
			} else if (opens < 0) {
				opens = 0;
			}

			buffer += char;
			index++;
			continue;

		}

		buffer += char;
		index++;

	}

	flushBuffer();

	return out + "</pre>";

}
