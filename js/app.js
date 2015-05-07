(function(window) {
  'use strict';

  function debug(str) {
    console.log('SettingsService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!
  var _locks = {};
  var _observers = {};

  var processSWRequest = function(channel, evt) {

    var _settings = navigator.mozSettings;
    // We can get:
    // * createLock
    // * addObserver
    // * removeObserver
    // * lock.set || lock.get
    // All the operations have a requestId, and the lock operations also include
    // a lock id.
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    function observerTemplate(evt) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: request.id,
          data: {
            settingName: evt.settingName,
            settingValue: evt.settingValue
          }
        }
      });
    }

    if (requestOp.operation === 'createLock') {
      _locks[request.id] = _settings.createLock();
      // Let's assume this works always..
      channel.postMessage({remotePortId: remotePortId, data: {id: request.id}});
    } else if (requestOp.operation === 'addObserver') {
      _observers[request.id] = observerTemplate;
      _settings.addObserver(requestOp.settingName, _observers[request.id]);
    } else if (requestOp.operation === 'removeObserver') {
      _settings.removeObserver(_observers[request.id]);
    } else if (requestOp.operation === 'onsettingschange') {
      _settings.onsettingchange = observerTemplate;
    } else {
      // It's either a get or a set... or an error but let's assume it isn't :P
      if (_locks[requestOp.lockId].closed) {
        _locks[requestOp.lockId] = _settings.createLock();
      }

      _locks[requestOp.lockId][requestOp.operation](requestOp.settings).
        then(result => {
          channel.postMessage({
            remotePortId: remotePortId,
            data: { id : request.id, result: result}}
          );
      });
    }
  };


  // Testing purpose only!!!!
  window.addEventListener('load', function () {
    if (window.ServiceHelper) {
      debug('APP serviceWorker in navigator');
      window.ServiceHelper.register(processSWRequest);
    } else {
      debug('APP navigator does not have ServiceWorker');
      return;
    }
  });

})(window);
