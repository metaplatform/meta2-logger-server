/*
 * meta2-logger-server
 *
 * Testing server start script
 *
 * @author Jiri Hybek <jiri@hybek.cz> (https://jiri.hybek.cz/)
 * @copyright 2017 - 2018 Jiří Hýbek
 * @license MIT
 */

import {default as logger, LOG_LEVEL} from "meta2-logger";
import {LoggerServer} from "./index";

logger.enableTrace();

const facilitites = [
	logger,
	logger.facility("http"),
	logger.facility("prom-exporter"),
	logger.facility("db"),
	logger.facility("api")
];

const server = new LoggerServer(logger, {
	enableServerLogs: true,
	exposeLogs: true,
	exposeUi: true,
	port: 9010,
	logLevel: LOG_LEVEL.DEBUG
});

server.start();

logger.toGrayLog({
	graylogHostname: "192.168.81.106",
	graylogPort: 12201,
	host: "TestLogger"
});

setInterval(() => {

	const level = Math.round(Math.random() * 7);

	const _logger = facilitites[ Math.floor( Math.random() * facilitites.length ) ];

	const meta = {
		reqId: Math.random()
	};

	switch (level) {
		case 7: _logger.debug(meta, "Hello %s", "debug"); break;
		case 6: _logger.info(meta, "Hello %s", "info"); break;
		case 5: _logger.notice(meta, "Hello %s", "notice"); break;
		case 4: _logger.warn(meta, "Hello %s", "warn"); break;
		case 3: _logger.error(meta, "Hello %s", "error", new Error("Test")); break;
		case 2: _logger.crit(meta, "Hello %s", "critical"); break;
		case 1: _logger.alert(meta, "Hello %s", "alert"); break;
		case 0: _logger.emerg(meta, "Hello %s", "emergency"); break;
	}

}, 1000 + Math.random() * 3000);
