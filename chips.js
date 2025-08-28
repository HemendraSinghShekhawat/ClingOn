const defaultChips = ["tag1", "tag2", "tag3", "tag4"];
const userAddedChips = [];
const browser = chrome ? chrome : browser;

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
    chipContainer.style.height = "fit-content";
  } else {
    chipDrawerAnchor.setAttribute("aria-label", "down-drawer-anchor");
    chipDrawerAnchor.innerHTML = "▼";
    chipContainer.style.height = "0px";
  }
};

chipDrawerAnchor.addEventListener("click", handleDrawerAnchor);

const createChip = (chip, innerText, onClick) => {
  chip.style.backgroundColor = "black";
  chip.style.backgroundColor = "#FF0000";
  chip.style.borderRadius = "8px";
  chip.style.padding = "4px 10px 4px 10px";
  chip.innerText = innerText;
  chip.addEventListener("click", (_) => onClick());
  chipContainer.appendChild(chip);
};

for (let i = 0; i < [...defaultChips, ...userAddedChips].length; i++) {
  let chip = document.createElement("button");
  createChip(chip, defaultChips[i], () => {
    browser.storage.local.get([`${defaultChips[i]}`], (item) => {
      const isKeyAlreadyPresentInStore = `${defaultChips[i]}` in item;
      const isAnyUrlAddedToTheStore = Array.isArray(item[`${defaultChips[i]}`]);
      if (isKeyAlreadyPresentInStore && isAnyUrlAddedToTheStore) {
        const uniqueUrls = Array.from(
          new Set([...item[`${defaultChips[i]}`], document.location.href]),
        );
        browser.storage.local.set(
          { [`${defaultChips[i]}`]: uniqueUrls },
          () => {
            console.info(
              `${document.location.href} successfully added to the key: ${defaultChips[i]}`,
            );
          },
        );
        return;
      }

      if (!isKeyAlreadyPresentInStore) {
        console.log("the key was not setup before");
        browser.storage.local.set({ [`${defaultChips[i]}`]: [] }, () => {
          browser.storage.local.get([`${defaultChips[i]}`], (item) => {
            browser.storage.local.set(
              { [`${defaultChips[i]}`]: [...item, document.location.href] },
              () => {
                console.info(
                  `new key setup successful, ${document.location.href} added to the key: ${defaultChips[i]}`,
                );
              },
            );
          });
        });
      } else {
        console.error(
          `there is value already present in key: ${defaultChips[i]}\n`,
          `this part of code should not be reached`,
        );
      }
    });
  });
}

let addButton = document.createElement("button");
createChip(addButton, "+", () => {
  console.log("TODO: Add button implementation is pending");
});

chipDrawer.appendChild(chipContainer);
chipDrawer.appendChild(chipDrawerAnchor);
document.body.appendChild(chipDrawer);
