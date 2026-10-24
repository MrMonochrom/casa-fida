Feature: Following the work through its stages
  The builder ticks off a project's stages as the work goes on; the client follows its progress.

  Scenario: Ticking off a stage
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    Then I see "2 of 8 stages done"
    When I set the stage "Framing" to "Done"
    Then I see "3 of 8 stages done"
    When I switch to Emma's browser
    And I open the project "Rear extension & open-plan kitchen"
    Then I see "3 of 8 stages done"
    And the stage "Framing" is "Done"

  Scenario: The client sees the stage change without reloading
    Given I am logged in as Emma
    And I open the project "Rear extension & open-plan kitchen"
    When Marcus sets the stage "Framing" of "Rear extension & open-plan kitchen" to "Done"
    Then I see "3 of 8 stages done"

  Scenario: Adding, renaming and removing a stage
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I add the stage "Landscaping"
    Then I see "2 of 9 stages done"
    When I rename the stage "Landscaping" to "Garden & landscaping"
    Then I see the stage "Garden & landscaping"
    When I click "Remove Garden & landscaping"
    Then I see "2 of 8 stages done"
    And I don't see "Garden & landscaping"

  Scenario: Adding a suggested stage
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I click "+ Site prep"
    Then I see the stage "Site prep"
    And I see "2 of 9 stages done"

  Scenario: Changing the order of the stages
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I click "Move Final inspection up"
    Then the stages are, in order:
      | Permits & design      |
      | Foundation            |
      | Framing               |
      | Roofing               |
      | Plumbing & electrical |
      | Insulation & drywall  |
      | Final inspection      |
      | Painting & finishes   |

  Scenario: Clients see the stages but can't change them
    Given I am logged in as Emma
    When I open the project "Rear extension & open-plan kitchen"
    Then the stage "Framing" is "In progress"
    And I don't see the button "Add"
    And I don't see the button "Move Framing up"
