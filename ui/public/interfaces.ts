/*
 * meta2-logger
 *
 * @author Jiri Hybek <jiri@hybek.cz> (https://jiri.hybek.cz/)
 * @copyright 2017 - 2018 Jiří Hýbek
 * @license MIT
 */

/**
 * Log levels
 */
export enum LOG_LEVEL {
	DEBUG = 7,
	INFO = 6,
	NOTICE = 5,
	WARN = 4,
	ERROR = 3,
	CRITICAL = 2,
	ALERT = 1,
	EMERGENCY = 0
}

/**
 * String to log level mapping
 */
export const LOG_LEVEL_NAME_MAP = {
	debug: LOG_LEVEL.DEBUG,
	info: LOG_LEVEL.INFO,
	notice: LOG_LEVEL.NOTICE,
	warn: LOG_LEVEL.WARN,
	warning: LOG_LEVEL.WARN,
	error: LOG_LEVEL.ERROR,
	critical: LOG_LEVEL.CRITICAL,
	crit: LOG_LEVEL.CRITICAL,
	alert: LOG_LEVEL.ALERT,
	emergency: LOG_LEVEL.EMERGENCY,
	emerg: LOG_LEVEL.EMERGENCY,
	panic: LOG_LEVEL.EMERGENCY
};

/**
 * Log level to string mapping
 */
export const LOG_LEVEL_NAME_MAP_INV = {};
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.DEBUG] = "debug";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.INFO] = "info";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.NOTICE] = "notice";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.WARN] = "warn";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.ERROR] = "error";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.CRITICAL] = "critical";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.ALERT] = "alert";
LOG_LEVEL_NAME_MAP_INV[LOG_LEVEL.EMERGENCY] = "emergency";

/**
 * Logger interface
 */
export interface ILogger {
	log(...args);
	debug(...args);
	info(...args);
	notice(...args);
	warn(...args);
	warning(...args);
	error(...args);
	crit(...args);
	alert(...args);
	emerg(...args);
	panic(...args);
	getLevel(): LOG_LEVEL;
	setLevel(level: LOG_LEVEL);
}

export interface ILoggerMetaData {
	[ K: string ]: string|number|boolean|Date;
	[ K: number ]: string|number|boolean|Date;
}

/**
 * Logger target interface
 */
export interface ILoggerTarget {
	log: (level: LOG_LEVEL, facility: string, args: Array<any>, meta: ILoggerMetaData) => void;
	close: () => void;
	getLevel(): LOG_LEVEL;
	setLevel(level: LOG_LEVEL);
}
