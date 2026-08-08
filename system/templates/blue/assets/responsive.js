(function () {
  'use strict';

  function setupMenu() {
    var menu = document.getElementById('MainMenu');
    if (!menu || menu.querySelector('.responsive-menu-toggle')) {
      return;
    }

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'responsive-menu-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'MainMenuItems');
    toggle.textContent = '网站导航';

    var list = menu.querySelector(':scope > ul');
    if (list) {
      list.id = 'MainMenuItems';
      menu.insertBefore(toggle, list);
    } else {
      menu.appendChild(toggle);
    }

    toggle.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024 && menu.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMenu);
  } else {
    setupMenu();
  }
}());
