import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { Project } from "./model";
import type { ScoreCheck, Scorecard } from "./scorecard";

const tone = (score: number) =>
  score >= 90 ? "good" : score >= 60 ? "fair" : "poor";

function Ring({ label, score }: { label: string; score: number }) {
  const circumference = 2 * Math.PI * 22;
  return (
    <div className={`score-ring is-${tone(score)}`}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="22" className="score-track" />
        <circle
          cx="26"
          cy="26"
          r="22"
          className="score-value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <strong aria-label={`${label} score ${score} out of 100`}>{score}</strong>
      <span>{label}</span>
    </div>
  );
}

/**
 * Search and speed scores at the top of "Review site", with what to fix.
 * The scorer renders every page, so it loads only when the review opens.
 */
export function ReviewScores({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (check: ScoreCheck) => void;
}) {
  const [card, setCard] = useState<Scorecard | null>(null);
  useEffect(() => {
    let live = true;
    void import("./scorecard").then(({ scoreProject }) => {
      if (live) setCard(scoreProject(project));
    });
    return () => {
      live = false;
    };
  }, [project]);
  if (!card)
    return (
      <div className="review-scores is-loading" role="status">
        Scoring search and speed…
      </div>
    );
  const failing = card.checks.filter((check) => !check.pass);
  return (
    <section className="review-scores" aria-label="Search and speed">
      <div className="review-score-rings">
        <Ring label="Search" score={card.seo} />
        <Ring label="Speed" score={card.speed} />
        <p>
          {failing.length
            ? `${failing.length} ${failing.length === 1 ? "fix" : "fixes"} would raise your scores. Titles, descriptions and headings help people find you; lighter pages open faster on phones.`
            : "Every page has a clear title, description and main heading, and loads light."}
        </p>
      </div>
      {failing.length > 0 && (
        <div className="review-items">
          {failing.map((check) => (
            <button key={check.id} onClick={() => onOpen(check)}>
              <span className={`review-kind kind-${check.category}`}>
                <Icon
                  name={check.category === "seo" ? "search" : "zap"}
                  size={16}
                />
              </span>
              <div>
                <strong>{check.title}</strong>
                <p>{check.detail}</p>
              </div>
              <Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
