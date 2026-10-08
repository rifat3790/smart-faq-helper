/**
 * Smart FAQ & Help Center — Storefront JS
 * Lightweight, Vanilla JavaScript (< 10KB), Accessible, Fast
 */

(function () {
  'use strict';

  // Prevent multiple executions if script is loaded by multiple blocks/embeds
  if (window.__SHMART_FAQ_INITIALIZED__) {
    return;
  }
  window.__SHMART_FAQ_INITIALIZED__ = true;

  // Global Event Delegation on document - ensures all dynamic items work 100%
  document.addEventListener('click', function (e) {
    // 1. Accordion Toggle
    const questionBtn = e.target.closest('.shmart-faq-question-btn');
    if (questionBtn) {
      e.preventDefault();
      const item = questionBtn.closest('.shmart-faq-item');
      const container = questionBtn.closest('.shmart-faq-container');
      if (!item || !container) return;

      const allowMultiple = container.dataset.allowMultiple === 'true';
      const isOpen = item.classList.contains('is-open');

      if (!allowMultiple) {
        container.querySelectorAll('.shmart-faq-item').forEach((other) => {
          if (other !== item) {
            other.classList.remove('is-open');
            const otherBtn = other.querySelector('.shmart-faq-question-btn');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      if (isOpen) {
        item.classList.remove('is-open');
        questionBtn.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('is-open');
        questionBtn.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    // 2. Helpful / Unhelpful Vote Button
    const voteBtn = e.target.closest('.shmart-faq-vote-btn');
    if (voteBtn) {
      e.preventDefault();
      handleVoteClick(voteBtn);
      return;
    }

    // 3. Category Filter Button
    const catBtn = e.target.closest('.shmart-faq-category-btn');
    if (catBtn) {
      e.preventDefault();
      handleCategoryClick(catBtn);
      return;
    }
  });

  // Handle Helpful / Unhelpful Voting
  async function handleVoteClick(btn) {
    const faqId = btn.dataset.faqId;
    const voteType = btn.dataset.voteType;
    const parentVotes = btn.closest('.shmart-faq-vote-btns');
    const feedbackSection = btn.closest('.shmart-faq-feedback');

    // Prevent duplicate clicks
    if (btn.disabled || btn.dataset.voted === 'true') {
      return;
    }

    // Check if already voted on this FAQ in this browser session
    const votedList = getVotedFaqs();
    if (votedList.includes(faqId)) {
      if (feedbackSection) {
        feedbackSection.innerHTML = '<span style="color: #6d7175; font-size: 13px;">You have already submitted feedback for this answer.</span>';
      }
      return;
    }

    // Mark as voted in UI immediately
    if (parentVotes) {
      parentVotes.querySelectorAll('.shmart-faq-vote-btn').forEach((b) => {
        b.disabled = true;
        b.dataset.voted = 'true';
        b.style.opacity = '0.5';
        b.style.cursor = 'default';
      });
      btn.classList.add('voted');
      btn.style.opacity = '1';
    }

    if (feedbackSection) {
      const feedbackMsg = voteType === 'HELPFUL' ? '👍 Thank you for your feedback!' : '🙏 Thanks for your feedback. We will improve this answer.';
      feedbackSection.innerHTML = `<span style="color: #008060; font-weight: 600;">${feedbackMsg}</span>`;
    }

    // Save in session storage
    addVotedFaq(faqId);

    try {
      const currentShop = window.Shopify?.shop || window.location.hostname;
      await fetch('/apps/faq-proxy/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faqId,
          voteType,
          sessionId: getSessionId(),
          shopParam: currentShop,
        }),
      });
    } catch (err) {
      console.error('Vote submission error', err);
    }
  }

  // Handle Category Filter Click
  function handleCategoryClick(btn) {
    const container = btn.closest('.shmart-faq-container');
    if (!container) return;

    container.querySelectorAll('.shmart-faq-category-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const categoryId = btn.dataset.category;
    const items = container.querySelectorAll('.shmart-faq-item');

    items.forEach((item) => {
      if (categoryId === 'all' || item.dataset.category === categoryId) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Live Search & Input Handling (Debounced)
  let searchDebounceTimer = null;
  document.addEventListener('input', function (e) {
    const searchInput = e.target.closest('.shmart-faq-search-input');
    if (!searchInput) return;

    const container = searchInput.closest('.shmart-faq-container');
    if (!container) return;

    const term = searchInput.value.trim().toLowerCase();
    const items = container.querySelectorAll('.shmart-faq-item');
    let matchCount = 0;

    items.forEach((item) => {
      const qText = item.querySelector('.shmart-faq-question-title')?.textContent?.toLowerCase() || '';
      const aText = item.querySelector('.shmart-faq-answer-content')?.textContent?.toLowerCase() || '';
      const tags = item.dataset.tags?.toLowerCase() || '';

      if (term === '' || qText.includes(term) || aText.includes(term) || tags.includes(term)) {
        item.style.display = 'block';
        matchCount++;
      } else {
        item.style.display = 'none';
      }
    });

    if (term.length > 2) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const currentShop = window.Shopify?.shop || window.location.hostname;
        fetch(`/apps/faq-proxy/search?q=${encodeURIComponent(term)}&shop=${encodeURIComponent(currentShop)}`).catch(() => {});
      }, 400);
    }
  });

  // Customer Question Inquiry Form Submission (Guarded against duplicate submit)
  document.addEventListener('submit', async function (e) {
    const form = e.target.closest('.shmart-faq-inquiry-form');
    if (!form) return;

    e.preventDefault();

    if (form.dataset.submitting === 'true') {
      return;
    }
    form.dataset.submitting = 'true';

    const submitBtn = form.querySelector('.shmart-faq-submit-btn');
    const nameInput = form.querySelector('[name="customerName"]');
    const emailInput = form.querySelector('[name="customerEmail"]');
    const messageInput = form.querySelector('[name="message"]');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }

    try {
      const currentShop = window.Shopify?.shop || window.location.hostname;
      const res = await fetch('/apps/faq-proxy/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: nameInput ? nameInput.value : '',
          customerEmail: emailInput ? emailInput.value : '',
          message: messageInput ? messageInput.value : '',
          pageUrl: window.location.pathname,
          shopParam: currentShop,
        }),
      });

      if (res.ok) {
        form.innerHTML = '<div style="background: #e3f1df; border: 1px solid #70b566; color: #108043; padding: 16px; border-radius: 6px; font-weight: 600; text-align: center;">✅ Thank you! Your question has been submitted successfully. Our support team will get back to you soon.</div>';
      } else {
        form.dataset.submitting = 'false';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Question';
        }
        alert('Could not submit inquiry. Please check your inputs and try again.');
      }
    } catch (err) {
      form.dataset.submitting = 'false';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Question';
      }
      alert('Network error. Please try again later.');
    }
  });

  function getSessionId() {
    let sid = sessionStorage.getItem('shmart_faq_sid');
    if (!sid) {
      sid = 'sid_' + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('shmart_faq_sid', sid);
    }
    return sid;
  }

  function getVotedFaqs() {
    try {
      const stored = sessionStorage.getItem('shmart_faq_voted');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function addVotedFaq(id) {
    try {
      const list = getVotedFaqs();
      if (!list.includes(id)) {
        list.push(id);
        sessionStorage.setItem('shmart_faq_voted', JSON.stringify(list));
      }
    } catch (e) {}
  }
})();
