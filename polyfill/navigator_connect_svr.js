'use strict';

(function(exports) {

  if (exports.NCPolyfill) {
    return;
  }

  function debug(str) {
    console.log("NC POLYFILL SVR -*- -->" + str);
  }

  var cltCount = 0;

  var connections = {};
  var handlerSet = false;

  // Returns a default, test, connection message. Normally connection messages
  // will only include connection data (such as the origin), and not any client
  // data.
  var getDefaultMsg = function() {
    debug('getDefaultMsg called');
    return {
      data: {
        data: "Hello from the main thread!",
        count: cltCount++
      },
      originURL: "We need an origin URL here!"
    };
  };

  // Msg from app to sw.
  // aMessage can have, as optional fields:
  // data: The data that the original message had
  // and as a MANDATORY field:
  // originURL: The originator of the message
  function getMessage(aMessage) {
    // We must construct a structure here to indicate our sw partner that
    // we got a message and how to answer it.
    aMessage = aMessage || getDefaultMsg();
    return {
      isFromIAC: true,
      originURL: aMessage.originURL,
      dataToSend: aMessage.data
    };

  }

  // Sends a message to the SW shim part. Note that this will be used only for connections
  // serverPort will hold the IAC port we will use to transmit the answers on this
  // channel to. Note that at this point the IAC channel is *not* multiplexed, so there's
  // one IAC channel (and one MessageChannel) per navigator.connect call.
  var sendConnectionMessage = function(aMessage, serverPort) {
    return new Promise((resolve, reject) => {
      debug('sendConnectionMessage...' + (aMessage ? JSON.stringify(aMessage):
                                         'Didn\'t receive a msg to send'));
      navigator.serviceWorker.ready.then(sw => {
        debug('sendConnectionMessage: Got a sw: ' + JSON.stringify(sw));

        var message = getMessage(aMessage);

        debug('Created the connection message:' + JSON.stringify(message));

        // This should send the message data as well as transferring
        // messageChannel.port2 to the service worker.
        // The service worker can then use the transferred port to reply via
        // postMessage(), which will in turn trigger the onmessage handler on
        // messageChannel.port1.
        // See
        // https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage

        var messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = function(event) {
          // We will get the answer for this communication here...
          if (event.data.error) {
            debug("Got an error as a response: " + event.data.error);
          } else {
            // The first answer we will get is just the accept or reject, which
            // we can use to remove this.
            debug("Got an answer for the request!: " +
                  JSON.stringify(event.data));
            // Here I have to check if the connection was accepted...
            if (event.data.accepted) {
              // And replace the event handler to process messages!
              messageChannel.port1.onmessage = function(messageEvent) {
                // Here we have to pass this message to the other side of the
                // IAC connection...
                debug('svr send By IAC:' + JSON.stringify(messageEvent.data));
                serverPort.postMessage(messageEvent.data);
              };

              // Set the event handler for response messages
              serverPort.onmessage = evt => {
                debug('serverPort.onmessage:' + JSON.stringify(evt.data));
                messageChannel.port1.postMessage(evt.data);
              };
              messageChannel.port1.onmessage(event);

            } else {
              delete messageChannel.port1;
            }
          }
        };

        debug('Sending message to the SW: ' + (sw.active?' sw active':'sw NO active'));
        sw.active && sw.active.postMessage(message, [messageChannel.port2]);
        // We could probably do this earlier...
        serverPort.start();
      });
    });
  };

  // Create a listener service for the IAC messages.
  var NavigatorConnectServerIAC = (function() {
    var started = false;

    function IAC() {
      this.connectionsURL = [];

      var request = navigator.mozApps.getSelf();
      request.onsuccess = domReq => {
        debug('NavigatorConnectServerIAC - onsuccess getSelf');
        var app = domReq.target.result;
        var manifest  = app.manifest;
        if (!manifest || !manifest.connections) {
          debug('Manifest does not have connections defined');
          this.connectionsURL = [];
        }
        for (var key in manifest.connections) {
          this.connectionsURL.push(key);
        }
        //only if we've defined connections we need to put the handler
        if (this.connectionsURL.length > 0) {
          navigator.mozSetMessageHandler('connection',
                                         this.onConnection.bind(this));
        }
      };
    }

    IAC.prototype = {
      inProgress: false,

      onConnection: function (request) {
        if (this.connectionsURL.indexOf(request.keyword) < 0) {
          debug('IAC.onconnection: no urls registered.');
          return;
        }
        var port = this.port = request.port;
        debug('IAC.onconnection: Sending conexion msg.');
        // Sends a connection request to the service worker

        // Waits for the first message before sending anything to the service
        // worker.
        // The first message received will hold the origin URL. This is *not* secure
        // but IAC does not pass the origin of the IAC messages.
        port.onmessage = aMessage => {
          debug('SVR: 1st port.onmessage: ' + JSON.stringify(aMessage) +
                ', ' + JSON.stringify(aMessage.data));
          var originURL = aMessage.data.originURL;
          sendConnectionMessage({
              originURL: originURL,
              data: null}, port);
        };
      }

    };

    return {
      start: function() {
        if (!started) {
          debug('Initializing IAC server');
          // Yes, it sucks. I'll change it at some point, this shouldn't even be an object.
          new IAC();
          started = true;
        }
      }
    };
  })();

  navigator.serviceWorker.ready.then(NavigatorConnectServerIAC.start);

  // This whole object should not be needed, except for tests, if
  // MessageChannel did work.
  // Since it doesn't work for Service Workers, it's needed, sadly.
  exports.NCPolyfill = {
    // sendMessage exported only for tests!
    sendMessage: sendConnectionMessage
    // And this is needed only because MessageChannel doesn't currently work!
  };

})(window);
