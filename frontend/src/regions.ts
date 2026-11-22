export type Region = { id: string; name: string; city: string; lat: number; lon: number };

// Administrative centers, shared by the map and analysis form.
export const regions: Region[] = [
  { id: 'abai', name: 'Абай облысы', city: 'Семей', lat: 50.411, lon: 80.228 },
  { id: 'akmola', name: 'Ақмола облысы', city: 'Көкшетау', lat: 53.283, lon: 69.383 },
  { id: 'aktobe', name: 'Ақтөбе облысы', city: 'Ақтөбе', lat: 50.283, lon: 57.167 },
  { id: 'almaty-region', name: 'Алматы облысы', city: 'Қонаев', lat: 43.866, lon: 77.067 },
  { id: 'atyrau', name: 'Атырау облысы', city: 'Атырау', lat: 47.116, lon: 51.883 },
  { id: 'west-kazakhstan', name: 'Батыс Қазақстан облысы', city: 'Орал', lat: 51.233, lon: 51.367 },
  { id: 'zhambyl', name: 'Жамбыл облысы', city: 'Тараз', lat: 42.9, lon: 71.367 },
  { id: 'zhetisu', name: 'Жетісу облысы', city: 'Талдықорған', lat: 45.015, lon: 78.373 },
  { id: 'karaganda', name: 'Қарағанды облысы', city: 'Қарағанды', lat: 49.806, lon: 73.085 },
  { id: 'kostanay', name: 'Қостанай облысы', city: 'Қостанай', lat: 53.215, lon: 63.624 },
  { id: 'kyzylorda', name: 'Қызылорда облысы', city: 'Қызылорда', lat: 44.848, lon: 65.502 },
  { id: 'mangystau', name: 'Маңғыстау облысы', city: 'Ақтау', lat: 43.653, lon: 51.197 },
  { id: 'pavlodar', name: 'Павлодар облысы', city: 'Павлодар', lat: 52.286, lon: 76.967 },
  { id: 'north-kazakhstan', name: 'Солтүстік Қазақстан облысы', city: 'Петропавл', lat: 54.875, lon: 69.162 },
  { id: 'turkistan', name: 'Түркістан облысы', city: 'Түркістан', lat: 43.297, lon: 68.251 },
  { id: 'ulytau', name: 'Ұлытау облысы', city: 'Жезқазған', lat: 47.783, lon: 67.714 },
  { id: 'east-kazakhstan', name: 'Шығыс Қазақстан облысы', city: 'Өскемен', lat: 49.948, lon: 82.628 },
  { id: 'astana', name: 'Астана', city: 'Астана', lat: 51.169, lon: 71.449 },
  { id: 'almaty-city', name: 'Алматы', city: 'Алматы', lat: 43.238, lon: 76.889 },
  { id: 'shymkent', name: 'Шымкент', city: 'Шымкент', lat: 42.315, lon: 69.586 },
];

export const republicCityIds = new Set(['astana', 'almaty-city', 'shymkent']);
