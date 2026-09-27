import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textLanguage } from '../src/i18n.js';

test('guesses the language of an issue', () => {
  assert.equal(textLanguage('El botón de guardar no funciona en la página de ajustes'), 'es');
  assert.equal(textLanguage('Try release upload for real'), 'en');
  assert.equal(textLanguage('The save button does not work on the settings page'), 'en');
  assert.equal(textLanguage('Añadir modo oscuro'), 'es');
  assert.equal(textLanguage(''), 'en');
});
