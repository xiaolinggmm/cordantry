import { DecisionScene } from "./DecisionScene";
import { CoordinationScene } from "./CoordinationScene";
import { ParallelScene } from "./ParallelScene";
import { FoundingScene } from "./FoundingScene";
import type { StoryCopy } from "./storyCopy";

export function StoryScene({
  scene,
  elapsed,
  reduced,
  c,
}: {
  scene: number;
  elapsed: number;
  reduced: boolean;
  c: StoryCopy;
}) {
  return (
    <div className="story-stage" aria-label={c.titles[scene]}>
      {scene === 0 && (
        <FoundingScene elapsed={elapsed} reduced={reduced} c={c} />
      )}
      {scene === 1 && (
        <CoordinationScene elapsed={elapsed} reduced={reduced} c={c} />
      )}
      {scene === 2 && (
        <ParallelScene elapsed={elapsed} reduced={reduced} c={c} />
      )}
      {scene === 3 && (
        <DecisionScene elapsed={elapsed} reduced={reduced} c={c} />
      )}
    </div>
  );
}
