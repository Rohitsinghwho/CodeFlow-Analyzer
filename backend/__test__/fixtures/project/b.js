export function init() {
  return helper();
}

export function helper() {
  return "helper";
}

export { helper as e };
export { helper as default };

export class Svc {
  run() {
    return helper();
  }
}
