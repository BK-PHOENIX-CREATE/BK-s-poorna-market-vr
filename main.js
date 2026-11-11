const $=id=>document.getElementById(id);
const toastEl=$('toast');let toastTimer;
window.marketToast=(message)=>{toastEl.textContent=message;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),4800)};
const nav=$('mainNav'),menu=$('menuToggle');
menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open))});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.classList.remove('open');menu.setAttribute('aria-expanded','false')}));
window.addEventListener('scroll',()=>{$('scrollBar').style.width=`${100*window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight)}%`;document.querySelector('.site-header').classList.toggle('scrolled',window.scrollY>24)},{passive:true});
const filterButtons = document.querySelectorAll('.filter');
const galleryCards = Array.from(document.querySelectorAll('.gallery-card'));

function filterDrawings(selectedButton) {
  for (const button of filterButtons) {
    const selected = button === selectedButton;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const group = selectedButton.dataset.filter;
  for (const card of galleryCards) {
    card.hidden = group !== 'all' && card.dataset.group !== group;
  }
}

filterDrawings(document.querySelector('.filter.active'));
filterButtons.forEach(button => button.addEventListener('click', () => filterDrawings(button)));

const lightbox = $('lightbox');
const lightboxImg = $('lightboxImg');
const drawingCanvas = lightbox.querySelector('.lightbox-body');
const drawingZoom = $('drawingZoom');
const drawingPrevious = $('drawingPrevious');
const drawingNext = $('drawingNext');
let visibleDrawings = [];
let drawingIndex = 0;
let openingCard;

function setDrawingZoom(zoomed) {
  drawingZoom.setAttribute('aria-pressed', String(zoomed));
  lightboxImg.classList.toggle('drawing-zoomed', zoomed);
  drawingCanvas.scrollTo(0, 0);
}

function showDrawing(index) {
  drawingIndex = index;
  const card = visibleDrawings[index];
  setDrawingZoom(false);
  lightboxImg.src = card.dataset.src;
  lightboxImg.alt = card.querySelector('img').alt;
  $('lightboxTitle').textContent = card.dataset.title;
  $('lightboxCount').textContent = `${index + 1} of ${visibleDrawings.length}`;
  $('drawingOriginal').href = card.dataset.src;
  drawingPrevious.disabled = index === 0;
  drawingNext.disabled = index === visibleDrawings.length - 1;
  if (document.activeElement === drawingPrevious && drawingPrevious.disabled) drawingNext.focus();
  if (document.activeElement === drawingNext && drawingNext.disabled) drawingPrevious.focus();
}

galleryCards.forEach(card => card.addEventListener('click', () => {
  openingCard = card;
  visibleDrawings = galleryCards.filter(drawing => !drawing.hidden);
  showDrawing(visibleDrawings.indexOf(card));
  lightbox.showModal();
  document.body.classList.add('modal-open');
}));

drawingPrevious.addEventListener('click', () => showDrawing(drawingIndex - 1));
drawingNext.addEventListener('click', () => showDrawing(drawingIndex + 1));
drawingZoom.addEventListener('click', () => setDrawingZoom(drawingZoom.getAttribute('aria-pressed') === 'false'));
lightboxImg.addEventListener('click', () => drawingZoom.click());
lightbox.addEventListener('keydown', event => {
  if (event.target === drawingCanvas) return;
  if (event.key === 'ArrowLeft' && !drawingPrevious.disabled) drawingPrevious.click();
  if (event.key === 'ArrowRight' && !drawingNext.disabled) drawingNext.click();
});
$('lightboxClose').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  lightboxImg.removeAttribute('src');
  openingCard.focus();
});
const observe=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');observe.unobserve(e.target)}})},{threshold:.08,rootMargin:'0px 0px -35px 0px'});
document.querySelectorAll('.intro-grid,.feature-media,.experience-heading,.drawings-top,.gallery-card,.story-grid,.explore-features>div').forEach(e=>{e.classList.add('reveal');observe.observe(e)});

// The architectural gallery stays usable even if the third-party Three.js CDN is inaccessible.
window.setTimeout(()=>{if(!window.market3dReady){const status=document.getElementById('viewerStatus');if(status)status.textContent='3D viewer needs internet access to load its rendering library. The drawings remain available.'}},10000);
