(function () {
    if (typeof document === 'undefined') return;

    var path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin')) return;
    if (document.querySelector('script[data-yeshi-adsense="true"]')) return;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4560345489955734';
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-yeshi-adsense', 'true');
    document.head.appendChild(script);
})();
