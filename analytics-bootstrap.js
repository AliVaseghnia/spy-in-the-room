(function (root) {
  'use strict';

  root.va = root.va || function () {
    (root.vaq = root.vaq || []).push(arguments);
  };
}(typeof window !== 'undefined' ? window : this));
