import { Composition } from "remotion";
import { HeroAnimation } from "./HeroAnimation";

export function RemotionRoot() {
  return (
    <Composition
      id="HeroAnimation"
      component={HeroAnimation}
      durationInFrames={180}  // 6 seconds at 30fps — full loop
      fps={30}
      width={860}
      height={300}
    />
  );
}
