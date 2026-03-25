interface RulesOverlayProps {
  onClose: () => void
}

interface RulesSection {
  title: string
  body: string
}

const RULES_SECTIONS: RulesSection[] = [
  {
    title: "Objective",
    body: 'Empty your Nertz pile and be the first to call "Nertz!"',
  },
  {
    title: "Setup",
    body: "Each player gets a 13-card Nertz pile (top card face-up), 4 face-up work piles, and the remaining cards as their stock.",
  },
  {
    title: "Foundations",
    body: "Shared center piles visible to all players. Start a pile with any Ace, then build up by suit (A → 2 → … → K). Any player can play here — race to build them!",
  },
  {
    title: "Work Piles",
    body: "Your personal piles. Build down in alternating colors (e.g. red 6 on black 7). Cards from your Nertz pile or waste can go here.",
  },
  {
    title: "Stock Pile",
    body: 'Click on the stock pile or tap "Flip Stock" to reveal cards one at a time to your waste. The top waste card is always playable. When stock runs out, flip the waste back over.',
  },
  {
    title: "Winning",
    body: 'When your Nertz pile is empty, click the "Nertz!" button. The game ends and scores are tallied from the foundation cards each player contributed.',
  },
]

/**
 * Full-screen overlay displaying the rules of Nertz.
 * Clicking the backdrop or the close button dismisses it.
 */
const RulesOverlay = ({ onClose }: RulesOverlayProps) => (
  <div
    className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    onClick={onClose}
  >
    <div
      className="relative mx-4 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all text-lg leading-none"
        aria-label="Close rules"
      >
        ✕
      </button>

      <h2 className="text-white text-xl font-black mb-4">How to Play Nertz</h2>

      <div className="flex flex-col gap-4">
        {RULES_SECTIONS.map(({ title, body }) => (
          <div key={title}>
            <h3 className="text-amber-400 text-sm font-bold uppercase tracking-wider mb-1">
              {title}
            </h3>
            <p className="text-white/80 text-sm leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
)

export default RulesOverlay
