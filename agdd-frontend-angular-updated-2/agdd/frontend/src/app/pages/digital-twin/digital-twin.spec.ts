import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DigitalTwin } from './digital-twin';

describe('DigitalTwin', () => {
  let component: DigitalTwin;
  let fixture: ComponentFixture<DigitalTwin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DigitalTwin]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DigitalTwin);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
