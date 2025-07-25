// Sidebar toggle for mobile ve masaüstü (menüyü sakla)
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.toggle("collapsed");
  }
}

// DOM yüklendiğinde butonlara event ekle
window.addEventListener("DOMContentLoaded", function () {
  // ... diğer kodlar ...
  var path = window.location.pathname;
  var activeLink = document.querySelector('.submenu-item[href="' + path + '"]');
  if (activeLink) {
    activeLink.classList.add('active');
    var submenu = activeLink.closest('.submenu');
    if (submenu) {
      submenu.classList.add('open');
      var parentToggle = submenu.previousElementSibling;
      if (parentToggle && parentToggle.classList.contains("menu-toggle")) {
        parentToggle.classList.add("open");
      }
    }
  }
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", function (event) {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.querySelector(".sidebar-toggle");

  // Check if elements exist to prevent errors if they are not in the DOM (e.g. during testing)
  if (window.innerWidth <= 768) {
    if (
      sidebar &&
      sidebarToggle &&
      !sidebar.contains(event.target) &&
      !sidebarToggle.contains(event.target)
    ) {
      sidebar.classList.remove("show");
    }
  }
});

/**
 * Menüdeki tüm aktif sınıfları ve açık alt menüleri temizler.
 * Toggle ikonlarını başlangıç durumuna getirir.
 */
function resetMenuState() {
  // Tüm menu-item ve submenu-item'lardan 'active' sınıfını kaldır
  document.querySelectorAll(".menu-item, .submenu-item").forEach((item) => {
    item.classList.remove("active");
  });

  // Tüm alt menüleri gizle
  document.querySelectorAll(".submenu").forEach((submenu) => {
    submenu.style.display = "none";
    // İlişkili menu-toggle'ın ikonunu aşağı çevir ve kendi aktifliğini kaldır
    const parentToggle = submenu.previousElementSibling;
    if (parentToggle && parentToggle.classList.contains("menu-toggle")) {
      parentToggle.classList.remove("active"); // Üst başlığın kendi aktifliğini de kaldır
      const toggleIcon = parentToggle.querySelector(".toggle-icon");
      if (toggleIcon) {
        toggleIcon.classList.remove("fa-chevron-up");
        toggleIcon.classList.add("fa-chevron-down");
      }
    }
  });
}

/**
 * Belirtilen bir menü öğesini aktif yapar ve bağlı olduğu tüm üst alt menüleri açar.
 * @param {HTMLElement} targetElement - Aktif yapılacak menü öğesi (<a> etiketi veya <div>.menu-toggle).
 */
function activateMenuItemAndParents(targetElement) {
  // Önce tüm aktiflikleri ve açık menüleri temizle
  // Ancak bu fonksiyon genellikle sadece bir öğeyi aktif ederken çağrılmalı.
  // Eğer tüm menü state'ini sıfırlamak istiyorsak, bu fonksiyon dışında çağrılmalı.
  // Burada sadece targetElement'ın ve parent'larının aktifliğini yönetiyoruz.

  // Tıklanan öğeyi veya mevcut sayfanın öğesini aktif yap
  if (targetElement) {
    targetElement.classList.add("active");

    // Eğer bir alt menü öğesiyse veya alt menü başlığı ise
    let currentParent = targetElement.closest(".submenu");
    while (currentParent) {
      currentParent.style.display = "block"; // Alt menüyü göster
      const parentToggle = currentParent.previousElementSibling;
      if (parentToggle && parentToggle.classList.contains("menu-toggle")) {
        parentToggle.classList.add("active"); // Üst başlığı da aktif göster
        const toggleIcon = parentToggle.querySelector(".toggle-icon");
        if (toggleIcon) {
          toggleIcon.classList.remove("fa-chevron-down");
          toggleIcon.classList.add("fa-chevron-up");
        }
      }
      currentParent = currentParent.parentElement.closest(".submenu"); // Bir üst alt menüye geç
    }
  }
}

// Tüm menü öğeleri için tıklama dinleyicisi
document.querySelectorAll(".menu-item, .submenu-item").forEach((item) => {
  item.addEventListener("click", function (e) {
    // Eğer tıklanan öğe bir alt menü başlığı (menu-toggle) ise
    if (this.classList.contains("menu-toggle")) {
      e.preventDefault(); // Bağlantı davranışını engelle (sayfa geçişi yapma)

      const submenu = this.nextElementSibling;
      const toggleIcon = this.querySelector(".toggle-icon");

      // Sadece bu alt menüyü aç/kapa
      if (submenu.style.display === "block") {
        submenu.style.display = "none";
        this.classList.remove("active"); // Kendini deaktif yap
        if (toggleIcon) {
          toggleIcon.classList.remove("fa-chevron-up");
          toggleIcon.classList.add("fa-chevron-down");
        }
      } else {
        // Diğer açık alt menüleri kapat (yalnızca menu-toggle olanları)
        document.querySelectorAll(".submenu").forEach((otherSubmenu) => {
          if (otherSubmenu !== submenu) {
            otherSubmenu.style.display = "none";
            const otherToggle = otherSubmenu.previousElementSibling;
            if (otherToggle && otherToggle.classList.contains("menu-toggle")) {
              otherToggle.classList.remove("active");
              const otherToggleIcon = otherToggle.querySelector(".toggle-icon");
              if (otherToggleIcon) {
                otherToggleIcon.classList.remove("fa-chevron-up");
                otherToggleIcon.classList.add("fa-chevron-down");
              }
            }
          }
        });

        submenu.style.display = "block"; // Bu alt menüyü aç
        this.classList.add("active"); // Kendini aktif yap
        if (toggleIcon) {
          toggleIcon.classList.remove("fa-chevron-down");
          toggleIcon.classList.add("fa-chevron-up");
        }
      }
    } else {
      // Normal bir bağlantı menü öğesi veya alt menü öğesi ise (sayfa değiştirecek)
      // Sayfa geçişi yapacağımız için e.preventDefault() kullanmıyoruz.
      // Ama aktifliği ayarlamak için önce resetleyip sonra aktifleştiriyoruz.
      resetMenuState(); // Sayfa değişimi öncesi tüm menüyü sıfırla
      // activateMenuItemAndParents(this); // Bu satırı kaldırdık, çünkü sayfa zaten yeniden yüklenecek ve DOMContentLoaded halledecek.

      // Close sidebar on mobile after menu selection, but ideally this should happen on page load of the new page
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
          sidebar.classList.remove("show");
        }
      }
    }
  });
});

window.addEventListener("DOMContentLoaded", function () {
  const currentPathname = window.location.pathname
    .split("/")
    .pop()
    .toLowerCase();

  // Menü durumunu sıfırla
  resetMenuState();

  let foundActive = false;

  document.querySelectorAll(".menu-item, .submenu-item").forEach((item) => {
    const href = item.getAttribute("href");
    if (href && href.split("/").pop().toLowerCase() === currentPathname) {
      activateMenuItemAndParents(item);
      foundActive = true;

      // Mobilde menüyü kapat
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.remove("show");
      }
    }
  });

  // Dashboard için yedek aktiflik kontrolü
  if (
    !foundActive &&
    (currentPathname === "" ||
      currentPathname === "dashboard2.php" ||
      currentPathname === "index.php")
  ) {
    const dashboardLink = document.querySelector('a[href="dashboard2.php"]');
    if (dashboardLink) {
      activateMenuItemAndParents(dashboardLink);
    }
  }

  
  

  // Profil dropdown ve widget kontrolleri
  const userInfo = document.getElementById("userInfo");
  const profileDropdown = document.getElementById("profileDropdown");
  const profileWidget = document.getElementById("profileWidget");
  const openProfileWidgetBtn = document.getElementById("openProfileWidget");

  if (userInfo && profileDropdown) {
    userInfo.addEventListener("click", function (e) {
      profileDropdown.style.display =
        profileDropdown.style.display === "block" ? "none" : "block";
      if (profileWidget) profileWidget.style.display = "none";
      e.stopPropagation();
    });
  }

  if (openProfileWidgetBtn && profileWidget && profileDropdown) {
    openProfileWidgetBtn.addEventListener("click", function (e) {
      profileDropdown.style.display = "none";
      profileWidget.style.display = "block";
      e.stopPropagation();
    });
  }

  document.addEventListener("click", function (e) {
    if (profileDropdown && !userInfo.contains(e.target)) {
      profileDropdown.style.display = "none";
    }
    if (
      profileWidget &&
      !profileWidget.contains(e.target) &&
      e.target !== openProfileWidgetBtn
    ) {
      profileWidget.style.display = "none";
    }
  });
});
// Progress animasyonları (varsa)
window.addEventListener("load", function () {
  const progressRings = document.querySelectorAll(".progress-ring .progress");
  progressRings.forEach((ring) => {
    const targetOffset = ring.style.strokeDashoffset === "0" ? "0" : "251.2";
    ring.style.strokeDashoffset = "251.2";
    setTimeout(() => {
      ring.style.strokeDashoffset = targetOffset;
    }, 100);
  });
});

// MODERN SIDEBAR ANİMASYONLARI (ek)
(function() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function(e) {
            if(window.innerWidth < 900) {
                sidebar.classList.toggle('open');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
    }
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            sidebar.classList.toggle('collapsed');
        });
    }

    // Modern ve akordeon sidebar menü
    document.querySelectorAll('.menu-toggle').forEach(toggle => {
      toggle.addEventListener('click', function() {
          const targetId = this.getAttribute('data-target');
          const submenu = document.getElementById(targetId);
  
          // Diğer tüm alt menüleri kapat
          document.querySelectorAll('.submenu').forEach(sub => {
              if (sub !== submenu) {
                  sub.classList.remove('open');
                  if (sub.previousElementSibling) sub.previousElementSibling.classList.remove('open');
              }
          });
  
          // Sadece tıklananı aç/kapa
          if (submenu) {
              submenu.classList.toggle('open');
              this.classList.toggle('open');
          }
      });
  });
})();

