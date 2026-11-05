const $=id=>document.getElementById(id);
const toastEl=$('toast');let toastTimer;
window.marketToast=(message)=>{toastEl.textContent=message;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),4800)};
const nav=$('mainNav'),menu=$('menuToggle');
menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open))});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.classList.remove('open');menu.setAttribute('aria-expanded','false')}));
window.addEventListener('scroll',()=>{$('scrollBar').style.width=`${100*window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight)}%`;document.querySelector('.site-header').classList.toggle('scrolled',window.scrollY>24)},{passive:true});
const filterButtons=document.querySelectorAll('.filter'),galleryCards=document.querySelectorAll('.gallery-card');
filterButtons.forEach(btn=>btn.addEventListener('click',()=>{filterButtons.forEach(b=>b.classList.toggle('active',b===btn));const group=btn.dataset.filter;galleryCards.forEach(card=>{card.hidden=group!=='all'&&card.dataset.group!==group})}));
const lightbox=$('lightbox'),lightboxImg=$('lightboxImg');let previousFocus=null;
function closeLightbox(){lightbox.hidden=true;document.body.classList.remove('modal-open');lightboxImg.removeAttribute('src');previousFocus?.focus()}
galleryCards.forEach(card=>card.addEventListener('click',()=>{previousFocus=document.activeElement;lightboxImg.src=card.dataset.src;lightboxImg.alt=card.dataset.title;$('lightboxTitle').textContent=card.dataset.title;lightbox.hidden=false;document.body.classList.add('modal-open');$('lightboxClose').focus()}));
$('lightboxClose').addEventListener('click',closeLightbox);lightbox.addEventListener('click',e=>{if(e.target===lightbox||e.target.classList.contains('lightbox-body'))closeLightbox()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!lightbox.hidden)closeLightbox()});
const observe=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');observe.unobserve(e.target)}})},{threshold:.08,rootMargin:'0px 0px -35px 0px'});
document.querySelectorAll('.intro-grid,.feature-media,.experience-heading,.drawings-top,.gallery-card,.story-grid,.explore-features>div').forEach(e=>{e.classList.add('reveal');observe.observe(e)});

// The architectural gallery stays usable even if the third-party Three.js CDN is inaccessible.
window.setTimeout(()=>{if(!window.market3dReady){const status=document.getElementById('viewerStatus');if(status)status.textContent='3D viewer needs internet access to load its rendering library. The drawings remain available.'}},10000);
