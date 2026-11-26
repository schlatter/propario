/**
 * Handing a text to the AI one uses elsewhere: which chat opens after copying (a convenience of
 * this device, kept in its browser storage), and copying with that chat opened in a new tab.
 * Nothing is sent along; the person pastes it. Used by "Find and ask" and the start card.
 */
import type { Messages } from '../../i18n/en'

/** Where people chat with their AI; opened in a new tab after copying, nothing is sent along. */
export const AI_CHATS = [
  { name: 'ChatGPT', href: 'https://chatgpt.com/' },
  { name: 'Claude', href: 'https://claude.ai/new' },
] as const
export type Chat = (typeof AI_CHATS)[number]['name'] | ''

const CHAT_KEY = 'propario.chat'
export function readChat(): Chat {
  try {
    const v = localStorage.getItem(CHAT_KEY) ?? ''
    return AI_CHATS.some((c) => c.name === v) ? (v as Chat) : ''
  } catch {
    return ''
  }
}
export function saveChat(chat: Chat) {
  try {
    localStorage.setItem(CHAT_KEY, chat)
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}

/** Copied first (the clipboard wants this page in focus), then the chosen chat opens – still within the click, so the browser lets it. */
export function copyForChat(text: string, chat: Chat, m: Messages, toast: (text: string) => void): Promise<void> {
  return navigator.clipboard
    .writeText(text)
    .then(() => {
      const to = AI_CHATS.find((c) => c.name === chat)
      toast(to ? m.ai.copiedOpen(to.name) : m.ai.copied)
      if (to) window.open(to.href, '_blank', 'noopener,noreferrer')
    })
    .catch(() => toast(m.ai.failed))
}
