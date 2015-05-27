(function(window) {
  'use strict';

  function debug(str) {
    console.log('MANU SettingsService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!
  var _locks = {};
  var _observers = {};
  var _settings = navigator.mozSettings;

  function buildDOMRequestAnswer(operation, channel, request) {
    debug('Building call --> ' + JSON.stringify(request));
    var remotePortId = request.remotePortId;
    var reqId = request.remoteData.id;
    var opData = request.remoteData.data.params || [];
    var requestOp = request.remoteData.data;

    // It's either a get or a set... or an error but let's assume it isn't :P
    if (_locks[requestOp.lockId].closed) {
      _locks[requestOp.lockId] = _settings.createLock();
    }

    _locks[requestOp.lockId][operation](...opData).then(result => {
      channel.postMessage({
        remotePortId: remotePortId,
        data: { id : reqId, result: result}}
      );
    });
  }

  function setHanlder(operation, channel, request) {
    var remotePortId = request.remotePortId;
    var reqId = request.remoteData.id;
    var requestOp = request.remoteData.data;

    function observerTemplate(evt) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: reqId,
          event: {
            settingName: evt.settingName,
            settingValue: evt.settingValue
          }
        }
      });
    }

    if (operation === 'addObserver') {
      _observers[reqId] = observerTemplate;
      _settings.addObserver(requestOp.settingName, _observers[reqId]);
    } else {
      _settings.onsettingchange = observerTemplate;
    }
  }

  var _operations = {
    createLock: function(channel, request) {
      var remotePortId = request.remotePortId;
      var reqId = request.remoteData.id;
      _locks[reqId] = _settings.createLock();
      // Let's assume this works always..
      channel.postMessage({remotePortId: remotePortId, data: {id: reqId}});
    },

    addObserver: setHanlder.bind(undefined, 'addObserver'),

    removeObserver: function(channel, request) {
      var reqId = request.remoteData.id;
      var requestOp = request.remoteData.data;
      _settings.removeObserver(requestOp.settingName,
        _observers[requestOp.observerId]);
    },

    onsettingchange: setHanlder.bind(undefined, 'onsettingchange');
  };

  var processSWRequest = function(channel, evt) {
    // We can get:
    // * createLock
    // * addObserver
    // * removeObserver
    // * lock.set || lock.get
    // All the operations have a requestId, and the lock operations also include
    // a lock id.
    var request = evt.data.remoteData;
    var requestOp = request.data.operation;

    debug('processSWRequest --> processing a msg:' +
          (evt.data ? JSON.stringify(evt.data): 'msg without data'));
    if (requestOp in _operations) {
      _operations[requestOp] &&
        _operations[requestOp](channel, evt.data);
    } else {
      console.error('Settings service unknown operation:' + requestOp);
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
