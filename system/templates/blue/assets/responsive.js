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

    menu.addEventListener('click', function (event) {
      if (window.innerWidth >= 1024 || !event.target.closest('a')) {
        return;
      }

      /* ddsmoothmenu treats a touch as a persistent hover. Because the legacy
         pages open links in a new tab, remove that transient desktop state
         from the page that remains visible underneath. */
      Array.prototype.forEach.call(
        menu.querySelectorAll('a.selected'),
        function (link) {
          link.classList.remove('selected');
        }
      );
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

      setupBannerCaption();
    });
  }

  function setupBannerCaption() {
    var banner = document.getElementById('banner');
    if (!banner) {
      return;
    }

    var bar = banner.querySelector('.KSS_titleBar');
    var title = banner.querySelector('.KSS_titleBox');
    var buttons = banner.querySelector('.KSS_btnBox');
    if (!bar || !title || !buttons) {
      return;
    }

    if (window.innerWidth < 1024) {
      if (title.parentNode !== bar) {
        bar.appendChild(title);
      }
      if (buttons.parentNode !== bar) {
        bar.appendChild(buttons);
      }
      return;
    }

    if (title.parentNode === bar) {
      banner.appendChild(title);
    }
    if (buttons.parentNode === bar) {
      banner.appendChild(buttons);
    }
  }

  function setupResponsivePage() {
    setupMenu();
    /* KinSlideshow is initialized by an earlier jQuery ready callback. Queue
       this work so its generated caption elements exist before restructuring. */
    setTimeout(setupBannerCaption, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupResponsivePage);
  } else {
    setupResponsivePage();
  }

  window.addEventListener('load', setupBannerCaption);
}());
