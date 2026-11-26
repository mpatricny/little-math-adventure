const comparison = document.querySelector('.comparison');
const buttons = [...document.querySelectorAll('button[data-view]')];
for (const button of buttons) {
  button.addEventListener('click', () => {
    comparison.dataset.view = button.dataset.view;
    for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
  });
}
document.querySelector('#background').addEventListener('click', (event) => {
  const light = document.body.classList.toggle('light');
  event.currentTarget.setAttribute('aria-pressed', String(light));
});
