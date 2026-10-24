export type Plant = {
  id: string;
  name: string;
  location: string;
  capacity: number;
  today: number;
  total: number;
  status: "运行中" | "待维护";
  efficiency: number;
  devices: number;
};
export const plants: Plant[] = [
  {
    id: "PL-001",
    name: "晴川·青山家庭电站",
    location: "浙江省 · 杭州市",
    capacity: 8.6,
    today: 31.8,
    total: 4286,
    status: "运行中",
    efficiency: 96,
    devices: 4,
  },
  {
    id: "PL-002",
    name: "晴川·云栖屋顶电站",
    location: "浙江省 · 宁波市",
    capacity: 12.4,
    today: 44.2,
    total: 6938,
    status: "运行中",
    efficiency: 92,
    devices: 6,
  },
  {
    id: "PL-003",
    name: "晴川·溪谷花园电站",
    location: "江苏省 · 苏州市",
    capacity: 6.2,
    today: 19.6,
    total: 2194,
    status: "待维护",
    efficiency: 78,
    devices: 3,
  },
];
export const validateEmail = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const validatePassword = (v: string) =>
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*._-]{8,32}$/.test(v);
export const demo = { account: "demo@example.com", password: "Demo2026" };
export const summary = { today: 95.6, month: 2184, total: 13418, co2: 8.42 };
