export class Box {
  open() {
    this.close();
  }

  close() {}
}

export function use(thing) {
  thing.close();
}
