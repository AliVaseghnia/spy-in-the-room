(function () {
  'use strict';

  var connectionStatus = document.getElementById('connection-status');
  var retryButton = document.getElementById('retry-button');

  function updateConnectionStatus() {
    connectionStatus.textContent = navigator.onLine
      ? 'You may be back online. Try again when you’re ready.'
      : 'No connection yet. Reconnect, then try again.';
  }

  updateConnectionStatus();
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  retryButton.addEventListener('click', function () { window.location.reload(); });
}());
