(function(window) {
  'use strict';

  function debug(str) {
    console.log("MANU - SettingsService -*-:" + str);
  }

  // This is a very basic sample app that uses a SW and acts as a server for
  // navigator.connect. I'm going to mark with a comment where the app MUST
  // add some extra code to use the navigator.connect SHIM
  // So if you just want to know that, search for:
  // ADDED FOR SHIM

  var register = function(evt) {
    debug('APP executing register...');
    navigator.serviceWorker.
      register('/settings-server/sw.js', {scope: './'}).
      then(function(reg) {
        debug('APP Registration succeeded. Scope: ' + reg.scope);
        if (reg.installing) {
          debug('APP registration --> installing');
        } else if (reg.waiting) {
          debug('APP registration --> waiting');
        } else if (reg.active) {
          debug('APP registration --> active');
        }
      }).catch(function(error) {
        debug('APP Registration failed with ' + error);
      });
  };

  var unregister = function(evt) {
    debug('APP Unregister...');
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => {
        reg.unregister();
        debug('APP Unregister done');
      });
    });
  };

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
debug(JSON.stringify(evt.data));
    function observerTemplate(evt) {
      debug('OBSERVER FIRED!');
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
    } else if (requestOp.operation === 'onsettingchange') {
      _settings.onsettingchange = observerTemplate;
    } else {
      // It's either a get or a set... or an error but let's assume it isn't :P
      if (_locks[requestOp.lockId].closed) {
        _locks[requestOp.lockId] = _settings.createLock();
      }
      var request =
        _locks[requestOp.lockId][requestOp.operation](requestOp.settings);

      request.onsuccess = () => {
        debug('SUCCESS - ' + request.result[requestOp.settings]);
        channel.postMessage({
          remotePortId: remotePortId,
          data: { id : request.id, result: request.result[requestOp.settings]}}
        );
      };

      request.onerror = () => {
        channel.postMessage({
          remotePortId: remotePortId,
          data: { id : request.id, result: false}}
        );
      };
    }
  };

  // Testing purpose only!!!!
  window.addEventListener('load', function () {
    if ('serviceWorker' in navigator) {
      debug('APP serviceWorker in navigator');
      register();
      navigator.serviceWorker.ready.then(sw => {
        // Let's pass the SW some way to talk to us...
        var mc = new MessageChannel();
        mc.port1.onmessage = processSWRequest.bind(this, mc.port1);
        sw.active && sw.active.postMessage({}, [mc.port2]);
      });
    } else {
      debug('APP navigator does not have ServiceWorker');
      return;
    }
  });

})(window);
