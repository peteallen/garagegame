#!/bin/bash
# Environment art batch. Stations inherit their palette from a matching
# vehicle anchor via the edit model so the whole world stays one toy family.
cd "$(dirname "$0")/.."

STYLE="Adorable clay-plasticine toy render for a toddler's video game, soft rounded shapes, warm studio lighting, matte clay texture with subtle fingerprint detail, bright cheerful colors. Seen from the front and slightly above, flat diorama style, no perspective depth. No ground shadow, no floor, no reflections, no text, no watermark."
GREEN="Solid pure bright green background (hex 00FF00) filling every pixel around the subject."

edit() {
  local anchor="$1" name="$2" prompt="$3"
  python3 scripts/edit_image.py "art/anchors/${anchor}.png" "art/raw/${name}.png" \
    "Using this toy vehicle ONLY as a style and palette reference (same clay material, same lighting), create a completely different subject: $prompt $STYLE $GREEN" \
    && echo "OK $name" || echo "FAIL $name"
}

gen() {
  local name="$1" prompt="$2"
  ./art/gen.sh "$name" "$prompt" --aspect-ratio "${3:-1:1}"
}

edit vehicle_icecream wash "a toy CAR WASH station: two chunky vertical roller-brush towers, the left one with a fluffy pink bristle roller and the right one with a fluffy teal bristle roller, connected by a sky-blue arched canopy decorated with three white soap bubbles, a wide open drive-through space between the towers with a dark slate floor strip." &
edit vehicle_ev charge "a toy ELECTRIC CHARGING pad station: a rounded mint-green floor pad with a white lightning bolt painted in the center, and a small friendly charger post standing at the top edge with a coiled pale cable and a tiny screen." &
edit vehicle_taxi air "a toy TIRE AIR pump station: a rounded amber-yellow floor pad with a white circular pressure gauge painted in the center, and a small friendly air pump post at the top edge with a coiled red hose." &
edit vehicle_fire lift "a toy CAR LIFT station: two sturdy coral-red hydraulic post columns on the left and right sides with rounded tops, connected by a flat open platform floor of warm gray with two yellow guide rails, everything low and wide." &
wait

edit vehicle_icecream booth "a toy PICKUP BOOTH kiosk for a garage: a tall coral-orange rounded kiosk with a wide mint-blue service window, a scalloped cherry-red and cream awning above the window, and a rounded red roof sign with a single white star, a tiny golden bell dot on the counter." &
edit vehicle_police door "a toy GARAGE ENTRANCE doorway seen straight on: a chunky rounded navy-blue outer frame like a cozy tunnel entrance, with a completely open plain very dark navy interior opening (empty, flat, no door panel, no slats), and a small red-and-cream striped awning across the top edge." &
edit vehicle_fire bell "a toy DOORBELL BUTTON: one big round button with a chunky golden-yellow outer ring, a cherry-red dome center, and a tiny cream highlight, like a big-easy-press toy button, viewed straight from above." &
gen pet_sit "An adorable ginger tabby toy kitten sitting upright facing the viewer, big friendly amber eyes, darker orange stripes, cream chest, pink inner ears, tail curled around front paws, gentle sweet smile. $STYLE $GREEN" &
wait

gen pet_walk "An adorable ginger tabby toy kitten walking toward the right in full side view, tail raised in a happy curve, darker orange stripes, cream chest and paws, one front paw lifted mid-step, content happy expression. $STYLE $GREEN" &
gen pet_sleep "An adorable ginger tabby toy kitten curled up asleep in a round bun shape, eyes closed peacefully, tail wrapped around to its nose, darker orange stripes on ginger fur, cream accents. $STYLE $GREEN" &
gen title_logo "Playful chunky video game logo wordmark that says exactly: BEEP BEEP GARAGE! - fat rounded golden-yellow capital letters with a thick navy-blue outline, slight cheerful arc, a tiny red toy car sitting on the exclamation point. Clay-plasticine toy render style, soft studio light. Solid pure bright green background (hex 00FF00) filling every pixel around the letters. No other text, no watermark." "8:3" &
gen ground "Flat top-down background painting for a toddler car game, landscape 16:9, made of clean horizontal bands from top to bottom: 1) soft sky-blue band with two tiny puffy white clouds (top 38 percent), 2) rounded light grass-green band with very subtle darker green blobs (next 25 percent), 3) light warm-gray smooth concrete band (next 15 percent), 4) dark blue-gray asphalt road band with one single row of chunky yellow dashed line segments running along its middle (next 17 percent), 5) slightly darker asphalt band at the very bottom (last 5 percent). Flat lay, no perspective, matte clay-toy texture, soft edges between bands, no objects, no cars, no buildings, no text, no shadows." "16:9" &
wait
echo ENV BATCH DONE