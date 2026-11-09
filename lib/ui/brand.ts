/**
 * The banner shared by the popup, the mini player and the panel inside
 * Icedrive: the polar bear from the icon (without its tile), the name and a
 * scatter of sparkles. Built from fixed SVG data with DOM calls, so it needs
 * no file the page would have to load (no web_accessible_resources) and
 * no markup parsing.
 */
import { el } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';
let maskCount = 0;

type Attrs = Record<string, string | number>;
function svgEl(doc: Document, tag: string, attrs: Attrs, ...children: Element[]): SVGElement {
  const node = doc.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  node.append(...children);
  return node;
}

const HEAD =
  'M64 25 C 87 25, 101 37, 103 53 C 109 59, 111 69, 105 75 C 108 84, 99 92, 90 94 C 82 102, 46 102, 38 94 C 29 92, 20 84, 23 75 C 17 69, 19 59, 25 53 C 27 37, 41 25, 64 25 Z';
const BAND = 'M24.7 45.2 C 33 2, 95 2, 103.3 45.2';

/** The bear with headphones from assets-src/icon.svg, white on transparent. */
export function bearMark(doc: Document, size: number): SVGElement {
  const id = `ice-bear-${++maskCount}`;
  const s = (tag: string, attrs: Attrs, ...children: Element[]) => svgEl(doc, tag, attrs, ...children);
  const cup = (x: number, rotate: string, d: string) =>
    s(
      'g',
      { transform: rotate },
      s('rect', { x, y: 33, width: 30, height: 44, rx: 14, fill: 'black' }),
      s('rect', { x: x + 3, y: 36, width: 24, height: 38, rx: 11, fill: 'white' }),
      s('path', { d, fill: 'none', stroke: 'black', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    );
  const mask = s(
    'mask',
    { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 128, height: 128 },
    s(
      'g',
      { transform: 'translate(0 3)' },
      s('path', { d: HEAD, fill: 'white', stroke: 'black', 'stroke-width': 6 }),
      s('path', { d: HEAD, fill: 'white' }),
      s('circle', { cx: 28, cy: 30, r: 15, fill: 'white' }),
      s('circle', { cx: 31, cy: 33, r: 8, fill: 'black' }),
      s('circle', { cx: 100, cy: 30, r: 15, fill: 'white' }),
      s('circle', { cx: 97, cy: 33, r: 8, fill: 'black' }),
      s('path', {
        d: 'M54 68 C 54 62, 74 62, 74 68 C 74 74, 67 78, 64 78 C 61 78, 54 74, 54 68 Z',
        fill: 'black',
        transform: 'translate(0 3)',
      }),
      s('path', {
        d: 'M64 81 v4 M56 88 q8 4 16 0 M42 58 q6.5 4 13 0 M73 58 q6.5 4 13 0',
        fill: 'none',
        stroke: 'black',
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }),
      s('path', { d: BAND, fill: 'none', stroke: 'black', 'stroke-width': 12, 'stroke-linecap': 'round' }),
      s('path', { d: BAND, fill: 'none', stroke: 'white', 'stroke-width': 6, 'stroke-linecap': 'round' }),
      cup(8, 'rotate(10 23 55)', 'M19 45 q-5 10 0 20'),
      cup(90, 'rotate(-10 105 55)', 'M109 45 q5 10 0 20'),
    ),
  );
  const fur = s(
    'linearGradient',
    { id: `${id}-fur`, x1: 0, y1: 0, x2: 0, y2: 1 },
    s('stop', { offset: 0, 'stop-color': '#ffffff' }),
    s('stop', { offset: 0.7, 'stop-color': '#f2fbfe' }),
    s('stop', { offset: 1, 'stop-color': '#d3f0fa' }),
  );
  return s(
    'svg',
    { class: 'logo', viewBox: '4 8 120 104', width: size, height: size, 'aria-hidden': 'true' },
    s('defs', {}, mask, fur),
    s('rect', { width: 128, height: 128, fill: `url(#${id}-fur)`, mask: `url(#${id})` }),
  );
}

/** Four-pointed sparkles: x, y, radius, opacity (in a 230 x 52 box anchored right). */
const SPARKLES: [number, number, number, number][] = [
  [176, 12, 5, 0.6],
  [150, 36, 3, 0.35],
  [124, 15, 2.2, 0.45],
  [196, 40, 2.6, 0.4],
  [98, 40, 1.8, 0.3],
  [214, 18, 3.4, 0.5],
  [70, 12, 1.6, 0.28],
];

function sparkles(doc: Document): SVGElement {
  const paths = SPARKLES.map(([x, y, r, o]) => {
    const k = r * 0.24;
    const d = `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
    return svgEl(doc, 'path', { d, fill: '#fff', 'fill-opacity': o });
  });
  return svgEl(doc, 'svg', { class: 'sparkles', viewBox: '0 0 230 52', 'aria-hidden': 'true' }, ...paths);
}

/** The banner: bear, "ICEDRIVE / Music Player+", sparkles, and an optional button on the right. */
export function buildBanner(doc: Document, button?: HTMLElement): HTMLElement {
  const name = el(doc, 'span', { class: 'brand-name' }, 'Music Player', el(doc, 'b', {}, '+'));
  const head = el(
    doc,
    'header',
    { class: 'head' },
    sparkles(doc),
    bearMark(doc, 34),
    el(doc, 'div', { class: 'brand' }, el(doc, 'span', { class: 'brand-kicker' }, 'Icedrive'), name),
  );
  if (button) head.append(button);
  return head;
}
