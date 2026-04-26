import './App.css'
import replayIcon  from './assets/icon-replay.svg'
import captureIcon from './assets/icon-capture.svg'
import timelineIcon from './assets/icon-timeline.svg'
import exportIcon  from './assets/icon-export.svg'
import sparkIcon   from './assets/icon-spark.svg'

const proposals = [
  {
    id: 1,
    name: 'Replay Loop',
    icon: replayIcon,
    alt: 'Circular clockwise arrow wrapping a play triangle',
    description:
      'A 315° arc with an arrowhead encircles a forward-play triangle — instantly communicates looped session playback.',
  },
  {
    id: 2,
    name: 'Event Capture',
    icon: captureIcon,
    alt: 'Dashed capture frame with cursor and recording dot',
    description:
      'A dashed capture frame surrounds a mouse cursor; a pulsing dot signals live recording — emphasises the browser-session capture phase.',
  },
  {
    id: 3,
    name: 'Animation Timeline',
    icon: timelineIcon,
    alt: 'Horizontal track with diamond keyframes and a playhead needle',
    description:
      'Diamond keyframes sit on a horizontal track with a scrubbing playhead — the visual language of every animation and video editor.',
  },
  {
    id: 4,
    name: 'Film Export',
    icon: exportIcon,
    alt: 'Film strip with sprocket holes and an upward export arrow',
    description:
      'A film strip with perforation holes paired with an upward export arrow — unites the animation and file-export concepts in one mark.',
  },
  {
    id: 5,
    name: 'Spark Mark',
    icon: sparkIcon,
    alt: 'Bold outer circle framing an inner replay arc and play triangle',
    description:
      'An outer boundary ring frames an inner replay arc and play triangle — an abstract, brand-logomark-style icon suited for app icons and favicons.',
  },
]

function App() {
  return (
    <main>
      <header className="site-header">
        <span className="badge">Icon Proposals</span>
        <h1>Claude Session Replay</h1>
        <p className="subtitle">Animation Export Toolkit — choose your icon</p>
      </header>

      <section className="icon-grid" aria-label="Icon proposals">
        {proposals.map((p) => (
          <article className="icon-card" key={p.id}>
            <div className="icon-option" aria-label={`Option ${p.id}`}>
              Option {p.id}
            </div>
            <div className="icon-display">
              <img src={p.icon} alt={p.alt} width={96} height={96} />
            </div>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
          </article>
        ))}
      </section>

      <footer className="site-footer">
        <a
          href="https://github.com/dotclaude/session-replay"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </footer>
    </main>
  )
}

export default App
