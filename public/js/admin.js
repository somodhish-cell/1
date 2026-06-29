// Admin CMS — small UI helpers.
(function () {
  'use strict';

  // Mobile sidebar toggle
  var toggle = document.querySelector('[data-admin-toggle]');
  var sidebar = document.querySelector('.admin-sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
  }

  // Auto-dismiss admin flash messages
  var flash = document.querySelector('.admin-flash');
  if (flash) {
    setTimeout(function () {
      flash.style.transition = 'opacity .4s';
      flash.style.opacity = '0';
      setTimeout(function () { flash.remove(); }, 400);
    }, 4000);
  }
})();
