/* ─────────────────────────────────────
   Flik — index.js
   ───────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

    /* ── Nav scroll state ───────────────── */
    const nav = document.querySelector('.nav');

    const onScroll = () => {
        nav.classList.toggle('scrolled', window.scrollY > 10);
    };

    window.addEventListener('scroll', onScroll, { passive: true });


    /* ── Search toggle ──────────────────── */
    const searchBtn = document.getElementById('searchBtn');
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const searchClose = document.getElementById('searchClose');

    const openSearch = () => {
        searchBar.classList.add('open');
        setTimeout(() => searchInput.focus(), 50);
    };

    const closeSearch = () => {
        searchBar.classList.remove('open');
        searchInput.value = '';
    };

    searchBtn?.addEventListener('click', openSearch);
    searchClose?.addEventListener('click', closeSearch);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearch();
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            searchBar.classList.contains('open') ? closeSearch() : openSearch();
        }
    });


    /* ── Genre pill filter ──────────────── */
    const pillRow = document.getElementById('pillRow');

    pillRow?.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;

        pillRow.querySelectorAll('.pill').forEach(p => p.classList.remove('pill--active'));
        pill.classList.add('pill--active');

        // Hook: fire a custom event others can listen to
        pillRow.dispatchEvent(new CustomEvent('genreChange', {
            bubbles: true,
            detail: { genre: pill.dataset.genre }
        }));
    });


    /* ── Media card hover depth ─────────── */
    // Adds a subtle 3-D tilt on hover for the hero cards
    document.querySelectorAll('.hero-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / (rect.width / 2);
            const dy = (e.clientY - cy) / (rect.height / 2);
            card.style.transform = `scale(1.025) translateY(-4px) rotateY(${dx * 4}deg) rotateX(${-dy * 4}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
        });
    });


    /* ── Intersection observer — fade-in on scroll ── */
    const fadeEls = document.querySelectorAll('.media-card, .stat-item, .cta-section');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    fadeEls.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `opacity 0.5s ${i * 0.05}s ease, transform 0.5s ${i * 0.05}s ease`;
        observer.observe(el);
    });


    /* ── "See all" buttons ──────────────── */
    document.querySelectorAll('.see-all').forEach(btn => {
        btn.addEventListener('click', () => {
            // Placeholder — wire to your router/page logic
            console.log('See all clicked');
        });
    });


    /* ── "Get started" / CTA buttons ────── */
    document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.addEventListener('click', () => {
            // Placeholder — wire to auth/signup flow
            console.log('CTA clicked');
        });
    });

});