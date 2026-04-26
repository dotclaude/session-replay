import './App.css'
import replayIcon  from './assets/icon-replay.svg'
import captureIcon from './assets/icon-capture.svg'
import timelineIcon from './assets/icon-timeline.svg'
import exportIcon  from './assets/icon-export.svg'
import sparkIcon   from './assets/icon-spark.svg'

const proposals = [
  {
    id: 1,
    name: 'Browser Play',
    icon: replayIcon,
    alt: 'Browser window with traffic-light dots and a play button in the viewport',
    description:
      'A browser chrome bar (with red/yellow/green traffic-light dots) frames a content area centred on a play button — the most direct expression of replaying a browser session.',
  },
  {
    id: 2,
    name: 'Cursor Ghost',
    icon: captureIcon,
    alt: 'Mouse cursor arrow with two progressively faded ghost copies trailing behind it',
    description:
      'A sharp pointer arrow leaves two fading ghost copies in its wake — immediately evokes the replay of recorded mouse movements and user interactions.',
  },
  {
    id: 3,
    name: 'Cel Stack',
    icon: timelineIcon,
    alt: 'Three offset animation frames stacked diagonally with a play arrow and scrubber',
    description:
      'Three animation cels fanned diagonally — back to front — with a play arrow in the foreground cel and a scrubber dot below. The language of frame-by-frame playback.',
  },
  {
    id: 4,
    name: 'Cassette Reel',
    icon: exportIcon,
    alt: 'Cassette tape body with two hub circles and a tape exposure window',
    description:
      'A cassette body with two reel hubs and an exposed tape window — a universal symbol for rewinding and replaying that transcends the digital era.',
  },
  {
    id: 5,
    name: 'Viewfinder',
    icon: sparkIcon,
    alt: 'Camera viewfinder circle with corner brackets, crosshair reticle, and recording dot',
    description:
      'Corner-bracket framing, a crosshair reticle, and a recording dot create a camera viewfinder — signalling the watch-and-record dual nature of the toolkit.',
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
