'use strict';

/**
 * Require the module dependencies
 */

const EventEmitter = require('events').EventEmitter;

/**
 * Server-Sent Event instance class
 * 
 * @extends EventEmitter
 */
class SSE extends EventEmitter {
  /**
     * Creates a new Server-Sent Event instance
     * 
     * @param [object]
     *            options SSE options
     */
  constructor(options) {
    super();

    if (options) {
      this.options = options;
    } else {
      this.options = {};
    }

    this.init = this.init.bind(this);
  }

  /**
     * The SSE route handler
     */
  init(req, res) {
    let id = 0;
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (req.httpVersion !== '2.0') {
      res.setHeader('Connection', 'keep-alive');
    }
    if (this.options.isCompressed) {
      res.setHeader('Content-Encoding', 'deflate');
    }

    // Increase number of event listeners on init
    this.setMaxListeners(this.getMaxListeners() + 2);

    const dataListener = data => {
      res.write(data);
    };

    this.on('data', dataListener);

    // Remove listeners and reduce the number of max listeners on client
    // disconnect
    req.on('close', () => {
      this.removeListener('data', dataListener);
      this.setMaxListeners(this.getMaxListeners() - 2);
    });
  }

  /**
     * Send data to the SSE
     * 
     * @param {(object|string)}
     *            data Data to send into the stream
     */
  send(data) {
    this.emit('data', data);
  }

}

module.exports = SSE;