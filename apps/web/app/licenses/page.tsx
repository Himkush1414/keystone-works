import type { Metadata } from 'next';
import { Prose } from '../../components/Prose';

export const metadata: Metadata = {
  title: 'Licences',
  description: 'The open-source software, voice model and fonts Lamplight is built with.',
};

const APP: [string, string, string][] = [
  ['Supertonic 3 voice model (int8)', 'BigScience Open RAIL-M', '/licenses/supertonic-3-open-rail-m.txt'],
  ['Supertonic reference code (text preparation)', 'MIT, © 2025 Supertone Inc.', ''],
  ['ONNX Runtime', 'MIT, © Microsoft Corporation', ''],
  ['AndroidX Media3', 'Apache 2.0', ''],
  ['PdfBox-Android', 'Apache 2.0', ''],
  ['React Native, Expo and their libraries', 'MIT (mostly; full list in the app)', ''],
  ['fflate', 'MIT', ''],
  ['htmlparser2', 'MIT', ''],
  ['Fraunces', 'SIL Open Font License 1.1', '/licenses/ofl-fraunces.txt'],
  ['Literata', 'SIL Open Font License 1.1', '/licenses/ofl-literata.txt'],
  ['Atkinson Hyperlegible Next', 'SIL Open Font License 1.1', '/licenses/ofl-atkinson-hyperlegible-next.txt'],
  ['OpenDyslexic', 'SIL Open Font License 1.1', '/licenses/ofl-opendyslexic.txt'],
];

const WEB: [string, string][] = [
  ['Next.js', 'MIT, © Vercel, Inc.'],
  ['React', 'MIT, © Meta Platforms, Inc. and affiliates'],
  ['Noto Serif Devanagari, Noto Sans Devanagari', 'SIL Open Font License 1.1, © Google LLC'],
];

export default function Licenses() {
  return (
    <Prose title="Licences" updated="26 October 2026">
      <p>Lamplight is built on the generous work of others. Thank you.</p>

      <h2>In the app</h2>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Licence</th>
          </tr>
        </thead>
        <tbody>
          {APP.map(([name, licence, href]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{href ? <a href={href}>{licence}</a> : licence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        The voice model is an int8-quantised version of Supertonic 3 prepared by the sherpa-onnx project
        (k2-fsa); Lamplight repacks its voice styles into a compact format without changing their values. Its
        use restrictions are part of our <a href="/terms#voice-model">terms of use</a>.
      </p>

      <h2>On this website</h2>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Licence</th>
          </tr>
        </thead>
        <tbody>
          {WEB.map(([name, licence]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{licence}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Sample texts</h2>
      <p>
        Pride and Prejudice (Jane Austen) and Alice’s Adventures in Wonderland (Lewis Carroll) come from
        Project Gutenberg transcriptions, with the Project Gutenberg header and footer removed. Idgah and
        Panch Parmeshwar (Premchand) come from Hindi Wikisource and are abridged. All four works are in the
        public domain. The recordings were made with the Supertonic 3 model and are machine-generated.
      </p>
    </Prose>
  );
}
