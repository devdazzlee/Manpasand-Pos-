import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // For web security reasons, we can't actually detect system printers
    // Instead, we'll return a simplified list that the user can choose from
    const printers = [
      {
        name: "Default System Printer",
        status: "ready",
        isDefault: true,
        type: "System Default"
      },
      {
        name: "Microsoft Print to PDF",
        status: "ready",
        isDefault: false,
        type: "Virtual Printer"
      }
    ];

    return NextResponse.json({ 
      success: true, 
      printers,
      count: printers.length 
    });
  } catch (error: any) {
    console.error('Error with printers:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch printers',
      printers: [] 
    }, { status: 500 });
  }
}
