import { Checkout } from "../checkout";
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) { return <Checkout id={(await params).id}/>; }
