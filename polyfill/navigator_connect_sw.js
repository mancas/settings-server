'use strict';

(function(sw) {

  // It's not good trying to load this twice
  if (sw.NCPolyfill) {
    return;
  }

  function debug(str) {
    // console.log("NC Polyfill (SW) -*-:" + str);
  }

  debug('Loaded!');

  // Messages that come from IAC should be marked somehow to distinguish them
  // from other messages the hosting app might want to pass.
  function isInternalMessage(aMessage) {
    return !!(aMessage && aMessage.data && aMessage.data.isFromIAC);
  }

  // This function converts the message received to the message format that the
  // onconnect handler expect, and invokes the adequate handler. The only
  // messages passed this way are the connection ones!
  function transmitMessage(evt) {
    debug('executing transmitMessage...');

    // In theory,
    // evt.ports[0] should correspond to the MessagePort that was transferred
    // as part of the controlled page's call to controller.postMessage().
    // Therefore, evt.ports[0].postMessage() will trigger the onmessage
    // handler from the controlled page.

    // Maybe we would need to do something with this...
    debug('isConnectionRequest msg:'+JSON.stringify(evt.data));
    var connectionMessage = evt.data.dataToSend || {};

    // We need to construct here what we will pass to onconnect, based on what
    // we have received. onconnect will need a way to return data to the source
    // http://mkruisselbrink.github.io/navigator-connect/
    // Since it's a connect message, then we have to add an acceptConnection
    // method to the event we dispatch.
    connectionMessage.targetURL = evt.data.originURL;

    // We will invoke a onconnect handler here. This onconnect must call
    // acceptCondition(with a promise or a boolean) and can set an onmessage
    // on the source we pass to it.
    connectionMessage.source = evt.ports[0];

    // And we should have a way to tell the parent that hey, we've accepted
    // the connection:
    connectionMessage.acceptConnection = aPromise => {
      if (typeof aPromise.then !== 'function') {
        // We got a value instead of a promise...
        aPromise = Promise.resolve(aPromise);
      }
      aPromise.then(accepted => {
        debug('acceptConnection accepted:' + accepted);
        connectionMessage.source.postMessage({accepted: accepted});
        // Now if we've *not* accepted the connection, we can clean up here
        if (!accepted) {
          delete connectionMessage.source;
        }
      });
    };

    if (sw.onconnect && typeof sw.onconnect == "function") {
      debug('executing onConnect with --> ' +
            JSON.stringify(connectionMessage));
      sw.onconnect(connectionMessage);
    }
  }

  sw.addEventListener('message', function(evt) {
    debug('Message Handler: ' + JSON.stringify(evt.data));
    if (!isInternalMessage(evt)) {
      debug('Got a message that\'s not for us, ignoring');
      return;
    }
    var data = transmitMessage(evt);
  });

  sw.NCPolyfill = {
    // We can't get rid of this one because there's only one
    // connection channel at the beginning
    isInternalMessage: isInternalMessage
  };

})(self);
