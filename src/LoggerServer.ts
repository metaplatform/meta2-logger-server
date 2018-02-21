/*
 * meta2-logger-server
 *
 * @author Jiri Hybek <jiri@hybek.cz> (https://jiri.hybek.cz/)
 * @copyright 2017 - 2018 Jiří Hýbek
 * @license MIT
 */

import http = require("http");
import Express = require("express");
import BodyParser = require("body-parser");
import {Request, Response} from "express";

import {Logger, LoggerFacility, LOG_LEVEL} from "meta2-logger";
import {loggerMiddleware, ILoggerMiddlewareOptions} from "./middleware";

/**
 * Management server configuration options
 */
export interface ILoggerServerOptions extends ILoggerMiddlewareOptions {

	/** Server port, default 9010 */
	port?: number;

	/** If to log management server events, default false */
	enableServerLogs?: boolean;

	/** Name of server logs facility, default 'logger-mgmt-srv' */
	serverLogsFacility?: string;

}

/**
 * Management server class
 */
export class LoggerServer {

	/** Logger instance to manage */
	protected logger: Logger;

	/** Server logging facility */
	protected srvFacility: LoggerFacility;

	/** Server port */
	protected port: number;

	/** HTTP server */
	protected server: http.Server;

	/** Express server instance */
	protected express: Express.Application;

	/**
	 * Server constructor
	 *
	 * @param options Server configuration
	 */
	public constructor(logger: Logger, opts: ILoggerServerOptions) {

		// Assign logger
		this.logger = logger;

		// Assign config
		this.port = opts.port || 9010;

		// Create HTTP server and express instance
		this.express = Express();
		this.server = http.createServer(this.express);

		this.srvFacility = logger.facility(opts.serverLogsFacility || "logger-mgmt-srv");

		// Register logging middleware?
		if (opts.enableServerLogs) {

			this.express.use((req: Request, res: Response, next) => {

				const meta = { method: req.method, path: req.path };

				this.srvFacility.debug(
					meta,
					"Incoming request %s \"%s\"",
					req.method,
					req.path,
					"query:", req.query,
					"params:", req.params,
					"headers", req.headers
				);

				next();

			});

		}

		// Register management middleware
		opts.managementFacility = this.srvFacility;

		this.express.use( loggerMiddleware(this.logger, Object.assign(opts, {
			port: this.port
		})) );

	}

	/**
	 * Start HTTP server
	 */
	public async start() {

		this.srvFacility.info("Starting...");

		return new Promise((resolve) => {

			this.server.listen(this.port, () => {

				this.srvFacility.info("Listening on port %d", this.port);
				resolve();

			});

		});

	}

	/**
	 * Stop HTTP server
	 */
	public close() {

		this.srvFacility.info("Stopping server...");
		this.server.close();

	}

}
