// tests/issue-357-copy.test.js
// Gate 3 regression: copyOutput is idempotent within the Copied! window.
// Harness mirrors tests/web-smoke.test.js (same DOM stubs + clipboard mock).
import { describe, test, expect, vi, beforeEach } from 'vitest'

const makeEl = (value = '') => ({
  value,
  textContent: '',
  hidden: false,
  disabled: false,
  classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
  addEventListener: vi.fn(),
  focus: vi.fn(),
})

const _inputEl       = makeEl('')
const _outputEl      = makeEl('')
const _btnSanitize   = makeEl()
const _btnCopyOutput = makeEl()
const _btnClear      = makeEl()
const _btnPaste      = makeEl()
const _inputCount    = makeEl('0 chars')
const _outputCount   = makeEl('0 chars')
const _statusChanges = makeEl()
const _toastEl       = makeEl()
const _toastMsg      = makeEl()
const _intakeZone    = makeEl()
const _dropOverlay   = makeEl()
const _fileInput     = makeEl()

const _clipboard = { writeText: vi.fn(), readText: vi.fn() }

function buildDOM() {
  const registry = {
    'textarea-input':      _inputEl,
    'textarea-output':     _outputEl,
    'btn-sanitize':        _btnSanitize,
    'btn-copy-output':     _btnCopyOutput,
    'btn-clear':           _btnClear,
    'btn-paste-clipboard': _btnPaste,
    'input-char-count':    _inputCount,
    'output-char-count':   _outputCount,
    'status-changes':      _statusChanges,
    'toast':               _toastEl,
    'toast-message':       _toastMsg,
    'intake-zone':         _intakeZone,
    'drop-overlay':        _dropOverlay,
    'file-input':          _fileInput,
  }
  vi.stubGlobal('document', {
    getElementById: vi.fn(id => registry[id] ?? null),
    addEventListener: vi.fn(),
  })
  vi.stubGlobal('navigator', { clipboard: _clipboard })
}

buildDOM()
const appModule = await import('../src/renderer/app.web.js')

beforeEach(() => {
  buildDOM()
  vi.clearAllMocks()
  _inputEl.value = ''
  _outputEl.value = ''
  _clipboard.writeText = vi.fn()
  _clipboard.readText = vi.fn()
  appModule._resetCopyGuardForTests()
})

describe('gate 3: copyOutput double-click repeat', () => {
  test('an immediate repeat of the SAME output does not write again', async () => {
    _outputEl.value = 'same output'
    await appModule.copyOutput()
    await appModule.copyOutput()
    expect(_clipboard.writeText).toHaveBeenCalledOnce()
  })

  test('a repeat after the content CHANGED writes again', async () => {
    _outputEl.value = 'first output'
    await appModule.copyOutput()
    _outputEl.value = 'second output'
    await appModule.copyOutput()
    expect(_clipboard.writeText).toHaveBeenCalledTimes(2)
    expect(_clipboard.writeText).toHaveBeenLastCalledWith('second output')
  })

  test('the guard resets via the test seam (window lapse simulation)', async () => {
    _outputEl.value = 'same output'
    await appModule.copyOutput()
    appModule._resetCopyGuardForTests()
    await appModule.copyOutput()
    expect(_clipboard.writeText).toHaveBeenCalledTimes(2)
  })
})
