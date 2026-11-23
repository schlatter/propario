// The website's only script: the copy button next to the commands. Without it, the commands can
// still be selected and copied by hand.
for (const button of document.querySelectorAll('button[data-copy]')) {
  const source = document.getElementById(button.dataset.copy)
  if (!source || !navigator.clipboard) continue
  button.hidden = false
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source.innerText.trim())
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select and copy by hand'
    }
    setTimeout(() => (button.textContent = 'Copy'), 2000)
  })
}
