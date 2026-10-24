Feature: Updates from the site
  The builder posts progress, with photos, while the project is in progress. The client sees each
  update straight away.

  Scenario: Posting an update with a photo
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Updates"
    And I fill in "Post an update" with "Drywall is going up in the family room."
    And I add the photo "site-photo.png"
    And I click "Post update"
    Then I see the update "Drywall is going up in the family room." with 1 photo
    When I switch to Emma's browser
    And I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Updates"
    Then I see the update "Drywall is going up in the family room." with 1 photo
    When I open the photo in the update "Drywall is going up in the family room."
    Then I see the dialog "Photo"

  Scenario: The client sees a new update without reloading
    Given I am logged in as Emma
    And I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Updates"
    When Marcus posts the update "The windows are in." on "Rear extension & open-plan kitchen"
    Then I see "The windows are in."

  Scenario: An update says something
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Updates"
    And I click "Post update"
    Then I see the error "Write a few words about the progress."

  Scenario: Deleting an update
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Updates"
    And I delete the update "Roof trusses delivered and set."
    Then I don't see "Roof trusses delivered and set."
    And I see "The walls are up on the extension!"

  Scenario: The overview shows the latest update
    Given I am logged in as Emma
    When I open the project "Rear extension & open-plan kitchen"
    Then I see "Latest update"
    And I see "Roof trusses delivered and set."
