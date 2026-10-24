// Intersection Observer for fade-in and bar animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('visible');

        // Animate stat counters
        if (entry.target.classList.contains('stats')) {
            entry.target.querySelectorAll('[data-target]').forEach(el => {
                animateCounter(el, +el.dataset.target);
            });
            entry.target.querySelectorAll('.bar-row__fill').forEach(bar => {
                bar.classList.add('animated');
            });
        }

        observer.unobserve(entry.target);
    });
}, { threshold: 0.15 });

// Observe sections
document.querySelectorAll('.section').forEach(section => {
    section.classList.add('fade-in');
    observer.observe(section);
});

function animateCounter(el, target) {
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

// ─── Categories Slider Controls & Drag Interaction ───
const categorySlider = document.getElementById('categorySlider');
const categoryPrevBtn = document.getElementById('categoryPrevBtn');
const categoryNextBtn = document.getElementById('categoryNextBtn');

if (categorySlider) {
    const getScrollAmount = () => {
        const firstCard = categorySlider.querySelector('.category-card');
        return firstCard ? firstCard.offsetWidth + 24 : 344;
    };

    if (categoryNextBtn) {
        categoryNextBtn.addEventListener('click', () => {
            categorySlider.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
        });
    }

    if (categoryPrevBtn) {
        categoryPrevBtn.addEventListener('click', () => {
            categorySlider.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
        });
    }

    // Mouse drag-to-slide
    let isDown = false;
    let startX = 0;
    let initialScrollLeft = 0;
    let hasMoved = false;

    categorySlider.addEventListener('mousedown', (e) => {
        isDown = true;
        hasMoved = false;
        categorySlider.style.cursor = 'grabbing';
        categorySlider.style.scrollSnapType = 'none'; // disable snap during drag
        startX = e.pageX - categorySlider.offsetLeft;
        initialScrollLeft = categorySlider.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        categorySlider.style.cursor = 'grab';
        categorySlider.style.scrollSnapType = 'x mandatory'; // re-enable snap
    });

    categorySlider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - categorySlider.offsetLeft;
        const walk = (x - startX) * 1.2;
        if (Math.abs(walk) > 5) hasMoved = true;
        categorySlider.scrollLeft = initialScrollLeft - walk;
    });

    // Prevent link click when dragging
    categorySlider.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (hasMoved) {
                e.preventDefault();
            }
        });
    });
}
