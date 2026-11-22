import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type RiskChartProps = {
  data: { name: string; count: number; color: string }[];
};

export default function RiskChart({ data }: RiskChartProps) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -22, right: 10, top: 5, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" stroke="var(--muted)" axisLine={false} tickLine={false} />
          <YAxis stroke="var(--muted)" allowDecimals={false} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)' }} />
          <Bar dataKey="count" name="Талдау" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map(category => <Cell key={category.name} fill={category.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
