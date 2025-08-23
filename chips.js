const chipData = ["tag1", "tag2", "tag3", "tag4"];

let chipDrawer = document.createElement("div");
chipDrawer.style.backgroundColor = "#FFFF00";
chipDrawer.style.position = "fixed";
chipDrawer.style.top = 0;
chipDrawer.style.left = 0;
chipDrawer.style.display = "flex";
chipDrawer.style.gap = "4px";

let chipContainer = document.createElement("div");
chipContainer.style.display = "flex";
chipContainer.style.gap = "4px";

let chipDrawerAnchor = document.createElement("button");
chipDrawerAnchor.id = "chip-drawer-anchor";
chipDrawerAnchor.style.backgroundColor = "#FF00FF";
chipDrawerAnchor.style.position = "absolute";
chipDrawerAnchor.style.transform = "translate(50%, 100%)";
chipDrawerAnchor.style.zIndex = 100;
chipDrawerAnchor.style.bottom = 0;
chipDrawerAnchor.style.right = "50%";
chipDrawerAnchor.style.display = "flex";
chipDrawerAnchor.style.gap = "4px";
chipDrawerAnchor.ariaLabel = "open-drawer-anchor";
chipDrawerAnchor.innerHTML = "▲";
// ▲ - U+25B2 // for further reference
// ▼ - U+25BC

const handleDrawerAnchor = () => {
  if (chipDrawerAnchor.getAttribute("aria-label") !== "open-drawer-anchor") {
    chipDrawerAnchor.setAttribute("aria-label", "open-drawer-anchor");
    chipDrawerAnchor.innerHTML = "▲";
    chipContainer.style.display = "flex";
  } else {
    chipDrawerAnchor.setAttribute("aria-label", "down-drawer-anchor");
    chipDrawerAnchor.innerHTML = "▼";
    chipContainer.style.display = "none";
  }
};

chipDrawerAnchor.addEventListener("click", handleDrawerAnchor);

for (let i = 0; i < chipData.length; i++) {
  let chip = document.createElement("button");
  chip.style.backgroundColor = "black";
  chip.style.backgroundColor = "#FF0000";
  chip.style.borderRadius = "8px";
  chip.style.padding = "4px 10px 4px 10px";
  chip.innerText = chipData[i];
  chipContainer.appendChild(chip);
}

chipDrawer.appendChild(chipContainer);
chipDrawer.appendChild(chipDrawerAnchor);
document.body.appendChild(chipDrawer);
