export default function() {
  var pseudoRand = new Date().valueOf() % 3;
  if (pseudoRand === 0) {
    document.body.className += "theme-moss";
  } else if (pseudoRand === 1) {
    document.body.className += "theme-shroom";
  }
}
