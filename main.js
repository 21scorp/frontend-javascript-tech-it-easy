// VOORRAAD ARRAY MET TV'S
const inventory = [
  {
    type: '43PUS6504/12',
    name: '4K TV',
    brand: 'Philips',
    price: 379,
    availableSizes: [43, 50, 58, 65],
    refreshRate: 50,
    screenType: 'LED',
    screenQuality: 'Ultra HD/4K',
    smartTv: true,
    options: {
      wifi: true,
      speech: false,
      hdr: true,
      bluetooth: false,
      ambiLight: false,
    },
    originalStock: 23,
    sold: 2,
  },
  {
    type: 'NH3216SMART',
    name: 'HD smart TV',
    brand: 'Nikkei',
    price: 159,
    availableSizes: [32],
    refreshRate: 100,
    screenType: 'LED',
    screenQuality: 'HD ready',
    smartTv: true,
    options: {
      wifi: true,
      speech: false,
      hdr: false,
      bluetooth: false,
      ambiLight: false,
    },
    originalStock: 4,
    sold: 4,
  },
  {
    type: 'QE55Q60T',
    name: '4K QLED TV',
    brand: 'Samsung',
    price: 709,
    availableSizes: [43, 50, 55, 58, 65],
    refreshRate: 60,
    screenType: 'QLED',
    screenQuality: 'Ultra HD/4K',
    smartTv: true,
    options: {
      wifi: true,
      speech: true,
      hdr: true,
      bluetooth: true,
      ambiLight: false,
    },
    originalStock: 7,
    sold: 0,
  },
  {
    type: '43HAK6152',
    name: 'Ultra HD SMART TV',
    brand: 'Hitachi',
    price: 349,
    availableSizes: [43, 50, 55, 58],
    refreshRate: 60,
    screenType: 'LCD',
    screenQuality: 'Ultra HD/4K',
    smartTv: true,
    options: {
      wifi: true,
      speech: true,
      hdr: true,
      bluetooth: true,
      ambiLight: false,
    },
    originalStock: 5,
    sold: 5,
  },
  {
    type: '50PUS7304/12',
    name: 'The One 4K TV',
    brand: 'Philips',
    price: 479,
    availableSizes: [43, 50, 55, 58, 65, 70],
    refreshRate: 50,
    screenType: 'LED',
    screenQuality: 'Ultra HD/4K',
    smartTv: true,
    options: {
      wifi: true,
      speech: true,
      hdr: true,
      bluetooth: true,
      ambiLight: true,
    },
    originalStock: 8,
    sold: 3,
  },
  {
    type: '55PUS7805',
    name: '4K LED TV',
    brand: 'Philips',
    price: 689,
    availableSizes: [55],
    refreshRate: 100,
    screenType: 'LED',
    screenQuality: 'Ultra HD/4K',
    smartTv: true,
    options: {
      wifi: true,
      speech: false,
      hdr: true,
      bluetooth: false,
      ambiLight: true,
    },
    originalStock: 6,
    sold: 3,
  },
  {
    type: 'B2450HD',
    name: 'LED TV',
    brand: 'Brandt',
    price: 109,
    availableSizes: [24],
    refreshRate: 60,
    screenType: 'LED',
    screenQuality: 'Full HD',
    smartTv: false,
    options: {
      wifi: false,
      speech: false,
      hdr: false,
      bluetooth: false,
      ambiLight: false,
    },
    originalStock: 10,
    sold: 8,
  },
  {
    type: '32WL1A63DG',
    name: 'HD TV',
    brand: 'Toshiba',
    price: 161,
    availableSizes: [32],
    refreshRate: 50,
    screenType: 'LED',
    screenQuality: 'Full HD',
    smartTv: false,
    options: {
      wifi: false,
      speech: false,
      hdr: true,
      bluetooth: false,
      ambiLight: false,
    },
    originalStock: 10,
    sold: 8,
  },
];

// 1a Gebruik een array-methode om een array te maken met alle tv-type namen. Log de uitkomst in de console.
const typeArray = inventory.map(item => item.type);
console.log(typeArray);

//1b Gebruik een array-methode om alle tv's te verzamelen (de hele objecten) die volledig uitverkocht zijn.
// Log de uitkomst in de console.
const soldOut = inventory.filter((item) => {
  if(item.sold >= item.originalStock){
    return item;
  }
})
console.log(soldOut);

//1c Gebruik een array-methode om alle tv's te verzamelen (de hele objecten) die over AmbiLight
//   beschikken. Log de uitkomst in de console.
const ambi = inventory.filter((item) => {
  if (item.options.ambiLight === true) {
    return item;
  }
})
console.log(ambi);

//1d Schrijf een functie die alle tv's van laagste naar hoogste prijs sorteert. Log de uitkomst in de console.
const sortPrice = inventory.sort((a, b) => (a.price) - (b.price));
console.log(sortPrice);

//2a Hoeveel tv's zijn er al verkocht? Schrijf een script dat dit berekent. Log de uitkomst in de console.
let result = 0;
  for (let i = 0; i < inventory.length; i++) {
    result += inventory[i].sold;
}
console.log(result);

//2b zorg ervoor dat dit aantal _in het groen_ wordt weergegeven op de pagina.
const soldTvs = document.getElementById('soldTv');
console.log(soldTvs);
soldTvs.textContent = result;
soldTvs.style.color = 'green';

//2c Hoeveel tv's heeft Tech It Easy ingekocht? Schrijf een script dat dit berekent. Log de uitkomst in de
//   console.
let result2 = 0;
  for (let i = 0; i < inventory.length; i++) {
  result2 += inventory[i].originalStock;
}
console.log(result2);

//2d Zorg ervoor dat dit aantal _in het blauw_ wordt weergegeven op de pagina.
const allStock = document.getElementById('tvStock');
console.log(allStock);
allStock.textContent = result2;
allStock.style.color = 'blue';

//2e Geef _in het rood_ weer hoeveel tv's er nog verkocht moeten worden.
let result3 = 0;
for (let i = 0; i < inventory.length; i++) {
  result3 += inventory[i].originalStock - inventory[i].sold;
}
console.log(result3);
const tvsleft = document.getElementById('tvLeft');
console.log(tvsleft);
tvsleft.textContent = result3;
tvsleft.style.color = 'red';

//3a Gebruik een array-methode om alle tv merken (zoals `Philips`, `NIKKEI`, etc.) in een lijst op de
//   pagina weer te geven. Zorg ervoor dat dit ook zou werken als we 200 tv's in onze array zouden hebben staan. Dat er
//   dubbele namen in zitten, is niet erg.
//const tvObjects = inventory.map(item => item);
//console.log(tvObjects);


//3b Schrijf de code uit 3a om naar een functie die een array met tv-objecten verwacht. Het is handig om
//   onze scripts als functies op te zetten, zodat we ze gemakkelijk kunnen hergebruiken. _Tip_: vergeet deze functie
//   -declaratie niet aan te roepen!
function add() {
  console.log(inventory.map(item => item));
}
add();


