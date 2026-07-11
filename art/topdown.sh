#!/bin/bash
# Convert each 3/4 style anchor into the strict top-down game sprite via the
# edit model, preserving the clay-toy family look. Vehicles that are green or
# teal render on magenta; everything else on green (see process_art.py keys).
cd "$(dirname "$0")/.."

BASE="Redraw this EXACT same toy vehicle seen from DIRECTLY OVERHEAD: a true top-down plan view, bird's-eye, camera pointing straight down, orthographic, absolutely no perspective, no 3/4 angle, no visible grille or sides. A flat game sprite showing only the vehicle's roof, hood and rear deck from above. The nose points RIGHT, the tail points LEFT, the vehicle is perfectly horizontal and centered. Keep the same clay-plasticine toy materials and colors."
FACE="REMOVE the face completely: no eyes, no eyeballs, no mouth, no eyebrows anywhere - headlights are plain glossy pale-amber lenses. NO wheels and NO tires visible anywhere - smooth fenders cover them entirely."
END="No shadow, no floor, no reflections, no text. The vehicle fills most of the frame with margin on all sides."
GREEN="Solid pure bright green background (hex 00FF00) filling every pixel around the vehicle."
MAGENTA="Solid pure bright magenta background (hex FF00FF) filling every pixel around the vehicle."

gen() {
  local name="$1" details="$2" bg="$3"
  python3 scripts/edit_image.py "art/anchors/${name}.png" "art/raw/${name}.png" \
    "$BASE Details to keep: $details $FACE $END $bg" \
    && echo "OK $name" || echo "FAIL $name"
}

gen vehicle_taxi "warm yellow taxi body, cream skirts and bumpers, dark navy checkered stripe running along BOTH long sides, small dark-gray roof sign centered on the roof, teal mirror and light accents, dark blue glass." "$GREEN" &
gen vehicle_police "cream-white police car body with dark blue doors and fenders, the roof light bar mounted across the roof with one blue lens and one red lens (not glowing), yellow-gold skirts and bumpers, teal accents, dark blue glass." "$GREEN" &
gen vehicle_pickup "teal pickup truck with tan wooden trim, an OPEN cargo bed at the rear (left half) showing the teal bed floor framed by tan wooden rails, orange mirrors and accents, dark blue glass on the cab." "$MAGENTA" &
gen vehicle_fire "red fire truck with yellow-gold trim, the wooden toy ladder mounted on the roof lying flat and pointing toward the rear (left), orange beacon dome near the cab front, dark blue glass." "$GREEN" &
wait

gen vehicle_icecream "mint-green ice cream truck, cream and pink scalloped awning trim around the roof edges, the big pink ice cream cone with sprinkles lying on the roof, pink accents, cream skirts, dark blue glass." "$MAGENTA" &
gen vehicle_bus "yellow-orange school bus, two yellow-gold roof rails running along the roof, rows of dark slate windows visible along both long sides, gold trim and bumpers, dark blue windshield." "$GREEN" &
gen vehicle_ev "small lavender-purple electric city car, pale mint roof spoiler and trim, a pale mint lightning bolt badge on the hood, mint mirrors, dark blue glass." "$MAGENTA" &
gen vehicle_tow "orange tow truck with yellow-gold trim, the yellow-gold boom arm lying flat over the rear bed pointing toward the rear (left) WITHOUT any hook or cable or rope, orange beacon dome on the cab roof, teal accents, dark blue glass." "$GREEN" &
wait
echo "BATCH DONE"
