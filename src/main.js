import { mountDemo } from './demo.js';

const root = document.querySelector('#app');

if (root !== null) {
  void mountDemo(root);
}
